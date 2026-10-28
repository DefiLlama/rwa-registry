/**
 * creationReads: the chain reads that date a deployment: an EVM address's code at a past block, a block's time, a Solana address's signatures and the program that owns a Solana account.
 * @dev review: src/discover/readers/evm.ts, src/discover/readers/solana.ts
 */
import * as sdk from '@defillama/sdk';
import { ClientError, RateLimitedError, TimeoutError } from '../../errors';
import { withTimeout, type RpcConfig } from './withTimeout';

export interface Signature {
  signature: string;
  slot: number;
  blockTime: number | null;
}

export interface CreationReads {
  evmHead(chain: string): Promise<number>;
  evmHasCode(query: { chain: string; address: string; block: number }): Promise<boolean>;
  evmBlockTime(chain: string, block: number): Promise<number>;
  solanaSignatures(query: {
    chain: string;
    address: string;
    before: string | null;
    limit: number;
  }): Promise<Signature[]>;
  // null when no account lives at the address.
  solanaOwner(query: { chain: string; address: string }): Promise<string | null>;
}

type Provider = {
  getBlockNumber(): Promise<number>;
  getCode(address: string, block?: number): Promise<string>;
  getBlock(block: number): Promise<{ timestamp: number | bigint } | null>;
};

const providerOf = (chain: string) => (sdk as unknown as { getProvider(chain: string): Provider }).getProvider(chain);

const { svm, rpc } = sdk.chains;

// The sdk's own errors carry no reason, so a rate limit is named here and the pacer can retry it.
const named = (label: string) => (cause: unknown) => {
  if (rpc.isRateLimitError(cause))
    throw new RateLimitedError({ source: 'rpc', reason: 'rate-limited', message: `${label}: rate limited`, cause });
  throw cause;
};

export const creationReads = (config: RpcConfig): CreationReads => ({
  evmHead: (chain) => withTimeout(providerOf(chain).getBlockNumber(), config.timeoutMs, `${chain} head`),

  // A node without the past state fails the read, which is history-unreadable and never "no code yet".
  evmHasCode: async ({ chain, address, block }) => {
    try {
      const code = await withTimeout(providerOf(chain).getCode(address, block), config.timeoutMs, `${chain} getCode`);
      return code !== '0x';
    } catch (cause) {
      if (cause instanceof TimeoutError || rpc.isRateLimitError(cause)) named(`${chain} getCode`)(cause);
      throw new ClientError({
        source: 'rpc',
        reason: 'history-unreadable',
        message: `${chain} getCode at block ${block} failed`,
        cause,
      });
    }
  },

  evmBlockTime: async (chain, block) => {
    const read = await withTimeout(providerOf(chain).getBlock(block), config.timeoutMs, `${chain} block ${block}`);
    if (!read) throw new ClientError({ source: 'rpc', reason: 'not-found', message: `${chain} has no block ${block}` });
    return Number(read.timestamp);
  },

  solanaSignatures: async ({ chain, address, before, limit }) => {
    const rows = (await withTimeout(
      rpc
        .jsonRpc('getSignaturesForAddress', [address, before ? { limit, before } : { limit }], {
          endpoints: svm.getEndpoints({ chain }),
          retries: 1,
        })
        .catch(named(`${chain} getSignaturesForAddress`)),
      config.timeoutMs,
      `${chain} getSignaturesForAddress`,
    )) as Signature[] | null;
    return (rows ?? []).map(({ signature, slot, blockTime }) => ({ signature, slot, blockTime: blockTime ?? null }));
  },

  solanaOwner: async ({ chain, address }) => {
    const read = (await withTimeout(
      rpc
        .jsonRpc('getAccountInfo', [address, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }], {
          endpoints: svm.getEndpoints({ chain }),
          retries: 1,
        })
        .catch(named(`${chain} getAccountInfo`)),
      config.timeoutMs,
      `${chain} getAccountInfo`,
    )) as { value?: { owner?: string } | null } | null;
    return read?.value?.owner ?? null;
  },
});
