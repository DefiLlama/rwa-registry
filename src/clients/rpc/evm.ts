/**
 * evmReads: one multicall per chain at the head; an address with no contract code reads as null.
 * @dev review: src/discover/discoverAddress.ts
 */
import * as sdk from '@defillama/sdk';
import { withTimeout, type RpcConfig } from './withTimeout';

export interface EvmReads {
  evmCall(query: {
    chain: string;
    abi: string;
    calls: { target: string; params?: unknown[] }[];
  }): Promise<(string | null)[]>;
}

// Tron's public node answers no getCode, so its reads skip the code check.
const NO_CODE_CHECK = new Set(['tron']);
const codeCache = new Map<string, string>();

const hasCode = async (chain: string, address: string): Promise<boolean> => {
  const key = `${chain}:${address.toLowerCase()}`;
  if (!codeCache.has(key)) {
    const provider = (
      sdk as unknown as { getProvider(chain: string): { getCode(a: string): Promise<string> } }
    ).getProvider(chain);
    const code = await provider.getCode(address).catch(() => 'ERR');
    if (code === 'ERR') return true;
    codeCache.set(key, code);
  }
  return codeCache.get(key) !== '0x';
};

export const evmReads = (config: RpcConfig): EvmReads => ({
  evmCall: async ({ chain, abi, calls }) => {
    const readable = await Promise.all(
      calls.map(({ target }) => (NO_CODE_CHECK.has(chain) ? true : hasCode(chain, target))),
    );
    const kept = calls.filter((_, index) => readable[index]);
    const results: unknown[] = kept.length
      ? await withTimeout(
          sdk.api2.abi.multiCall({ chain, abi, calls: kept as never, permitFailure: true }),
          config.timeoutMs,
          `${chain} multicall`,
        )
      : [];
    let next = 0;
    return calls.map((_, index) => (readable[index] ? ((results[next++] as string | null) ?? null) : null));
  },
});
