/**
 * discoverDeps: what every date reader is handed: the http client and the chain reads it needs, the config and one pacer per source.
 * @dev review: src/discover/paced.ts
 */
import { createHttp, type HttpClient, type HttpRequest } from '../clients/http';
import { creationReads, type CreationReads } from '../clients/rpc/creation';
import { evmReads, type EvmReads } from '../clients/rpc/evm';
import { loadDiscoverConfig, type DiscoverConfig, type DiscoverSource, type Env } from './discoverConfig';
import { paced, type Paced, type Sleep } from './paced';

// Only these clients: the explorers, Alchemy and toncenter speak through http, the public-node fallback and the erc20 reads through rpc.
export interface DiscoverClients {
  http: HttpClient;
  rpc: CreationReads & EvmReads;
}

export interface DiscoverDeps {
  clients: DiscoverClients;
  discover: DiscoverConfig;
  paced: Record<DiscoverSource, Paced>;
  now: Date;
  log: (line: string) => void;
}

export const pacersOf = (discover: DiscoverConfig, wait?: Sleep): Record<DiscoverSource, Paced> =>
  Object.fromEntries(
    Object.entries(discover.sources).map(([name, source]) => [name, paced(source, discover, wait)]),
  ) as Record<DiscoverSource, Paced>;

export const buildDiscoverDeps = (env: Env, log: (line: string) => void): DiscoverDeps => {
  const discover = loadDiscoverConfig(env);
  const rpc = { timeoutMs: discover.sources.evmCode.timeoutMs };
  const clients = { http: createHttp(discover.http), rpc: { ...evmReads(rpc), ...creationReads(rpc) } };
  if (!discover.sources.etherscan.apiKey)
    log('ETHERSCAN_API_KEY is not set: every EVM date comes from the code search, about 33 RPC reads each');
  if (!discover.sources.alchemy.apiKey)
    log('ALCHEMY_KEY is not set: the code search and Solana ask the public nodes, which rarely serve past state');
  if (!discover.sources.solscan.apiKey)
    log('SOLSCAN_API_KEY is not set: every Solana mint goes to the signature walk instead of one Solscan call');
  if (!discover.sources.toncenter.apiKey) log('TONCENTER_API_KEY is not set: toncenter answers at its public rate');
  return { clients, discover, paced: pacersOf(discover), now: new Date(), log };
};

// Every answer from an outside source waits its turn in that source's pacer and gives up at that source's timeout.
export const askJson = <T>(deps: DiscoverDeps, source: DiscoverSource, request: HttpRequest): Promise<T> =>
  deps.paced[source](() =>
    deps.clients.http.json<T>({ timeoutMs: deps.discover.sources[source].timeoutMs, ...request }),
  );
