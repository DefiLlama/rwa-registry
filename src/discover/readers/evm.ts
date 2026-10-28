/**
 * evm: the creation block of an EVM contract from the chain's explorers in turn (Etherscan V2 with the key, then a Blockscout explorer), and the code search for the addresses none answers.
 * @dev review: src/discover/readers/contractCreation.ts, src/discover/readers/firstCode.ts
 */
import { reasonOf } from '../../errors/reasons';
import { chunk } from '../../utils/chunk';
import { groupBy } from '../../utils/groupBy';
import type { DateQuery, DateReader } from '../dateReader';
import { missingOf, whyOf, type DateResult } from '../dateResult';
import type { DiscoverDeps } from '../discoverDeps';
import { contractCreations, type CreationApi } from './contractCreation';
import { firstCode } from './firstCode';

interface Explorer {
  name: string;
  api: CreationApi;
  batchSize: number;
  // Whether a thrown error refuses the chain for the run; otherwise the batch is null with that reason.
  refusedBy(error: unknown): boolean;
}

const TRANSIENT = new Set(['rate-limited', 'timeout']);

// A refusal holds for the whole run, so a chain is named once and never asked again until the next run.
const refusals = new WeakMap<DiscoverDeps, Set<string>>();
const refusedOf = (deps: DiscoverDeps) => {
  if (!refusals.has(deps)) refusals.set(deps, new Set());
  return refusals.get(deps)!;
};

const explorersOf = (chain: string, deps: DiscoverDeps): Explorer[] => {
  const { etherscan, blockscout } = deps.discover.sources;
  const chainId = etherscan.chainIds[chain];
  const base = blockscout.explorers[chain];
  const explorers: Explorer[] = [];
  if (etherscan.apiKey && chainId)
    explorers.push({
      name: `etherscan refused chain ${chainId}`,
      api: {
        source: 'etherscan',
        url: etherscan.baseUrl,
        query: { chainid: chainId, apikey: etherscan.apiKey },
        shown: { chainid: chainId },
      },
      batchSize: etherscan.batchSize,
      refusedBy: () => false,
    });
  if (base)
    explorers.push({
      name: `blockscout ${base} refused ${chain}`,
      api: { source: 'blockscout', url: `${base}/api`, query: {}, shown: {} },
      batchSize: blockscout.batchSize,
      refusedBy: (error) => !TRANSIENT.has(reasonOf(error)),
    });
  return explorers;
};

const readChain = async (
  chain: string,
  group: DateQuery[],
  deps: DiscoverDeps,
  results: Map<DateQuery, DateResult>,
) => {
  const refused = refusedOf(deps);
  for (const explorer of explorersOf(chain, deps)) {
    const refuse = (why: string) => {
      refused.add(explorer.name);
      deps.log(`${explorer.name} (${why}): its addresses go to the next source for the rest of this run`);
    };
    for (const batch of chunk(
      group.filter((query) => !results.has(query)),
      explorer.batchSize,
    )) {
      if (refused.has(explorer.name)) break;
      const read = await contractCreations(explorer.api, batch, deps).catch((error: unknown) => {
        if (!explorer.refusedBy(error)) return batch.map(() => missingOf(error));
        refuse(whyOf(missingOf(error)));
        return null;
      });
      if (read && 'refused' in read) refuse(read.refused);
      else read?.forEach((result, index) => results.set(batch[index], result));
    }
  }
  await Promise.all(
    group
      .filter((query) => !results.has(query))
      .map(async (query) =>
        results.set(query, await firstCode(query, deps).catch((error: unknown) => missingOf(error))),
      ),
  );
};

export const evm: DateReader = {
  family: 'evm',
  read: async (queries, deps) => {
    const results = new Map<DateQuery, DateResult>();
    await Promise.all(
      [...groupBy(queries, ({ chain }) => chain)].map(([chain, group]) => readChain(chain, group, deps, results)),
    );
    return queries.map((query) => results.get(query)!);
  },
};
