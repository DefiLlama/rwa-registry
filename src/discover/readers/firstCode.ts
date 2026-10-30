/**
 * firstCode: an EVM address's deployment day by binary search on its code over block numbers, on Alchemy or the public node.
 * @dev review: src/clients/rpc/creation.ts, src/discover/readers/alchemy.ts
 */
import { reasonOf } from '../../errors/reasons';
import { ClientError } from '../../errors';
import type { DateQuery } from '../dateReader';
import { dayOf } from '../../utils/days';
import { found, missing, missingOf, type DateResult } from '../dateResult';
import type { DiscoverDeps } from '../discoverDeps';
import { alchemyCall, alchemyUrl } from './alchemy';

export interface CodeNode {
  name: string | null;
  head(): Promise<number>;
  hasCode(block: number): Promise<boolean>;
  blockTime(block: number): Promise<number>;
}

const hex = (block: number) => `0x${block.toString(16)}`;

const publicNode = ({ chain, address }: DateQuery, deps: DiscoverDeps): CodeNode => {
  const { rpc } = deps.clients;
  const run = deps.paced.evmCode;
  return {
    name: null,
    head: () => run(() => rpc.evmHead(chain)),
    hasCode: (block) => run(() => rpc.evmHasCode({ chain, address, block })),
    blockTime: (block) => run(() => rpc.evmBlockTime(chain, block)),
  };
};

const alchemyNode = (url: string, { address }: DateQuery, deps: DiscoverDeps): CodeNode => ({
  name: 'alchemy',
  head: async () => Number(await alchemyCall<string>(deps, url, 'eth_blockNumber', [])),
  hasCode: async (block) => (await alchemyCall<string>(deps, url, 'eth_getCode', [address, hex(block)])) !== '0x',
  blockTime: async (block) => {
    const read = await alchemyCall<{ timestamp?: string } | null>(deps, url, 'eth_getBlockByNumber', [
      hex(block),
      false,
    ]);
    if (!read?.timestamp)
      throw new ClientError({ source: 'alchemy', reason: 'not-found', message: `no block ${block}` });
    return Number(read.timestamp);
  },
});

const nodeOf = (query: DateQuery, deps: DiscoverDeps): CodeNode => {
  const url = alchemyUrl(deps, query.chain);
  return url ? alchemyNode(url, query, deps) : publicNode(query, deps);
};

const sourceOf = ({ chain, address }: DateQuery, node: CodeNode) =>
  `eth_getCode ${chain} ${address}${node.name ? ` (${node.name})` : ''}`;

// A day holds this many search windows, so the search stops once a window fits in one day, about one time in four.
const WINDOWS_PER_DAY = 4;
const SAMPLE = 10_000;
const DAY = 86_400;

interface ChainClock {
  head: number;
  headTime: number;
  // Blocks per day over the last SAMPLE blocks; 0 when the node gives no usable times, and the search then runs to the block.
  perDay: number;
}

// One map per run, so a run reads each chain's head and pace once and a public node that timed out is asked no more.
const perRun = <T>(make: () => T) => {
  const runs = new WeakMap<DiscoverDeps, T>();
  return (deps: DiscoverDeps) => {
    if (!runs.has(deps)) runs.set(deps, make());
    return runs.get(deps)!;
  };
};
const clocksOf = perRun(() => new Map<string, Promise<ChainClock>>());
const droppedOf = perRun(() => new Set<string>());

const readClock = async (node: CodeNode, floor: number): Promise<ChainClock> => {
  const head = await node.head();
  const back = Math.max(floor, head - SAMPLE);
  const [headTime, backTime] = await Promise.all([node.blockTime(head), node.blockTime(back)]);
  const perDay = head > back && headTime > backTime ? ((head - back) * DAY) / (headTime - backTime) : 0;
  return { head, headTime, perDay };
};

// A failed read is not kept, so a rate limit on the first address does not fail the chain for the run.
const clockOf = (query: DateQuery, node: CodeNode, floor: number, deps: DiscoverDeps) => {
  const clocks = clocksOf(deps);
  const key = `${node.name ?? 'public'} ${query.chain}`;
  if (!clocks.has(key)) {
    const read = readClock(node, floor);
    read.catch(() => clocks.delete(key));
    clocks.set(key, read);
  }
  return clocks.get(key)!;
};

const dayAt = (seconds: number) => dayOf(new Date(seconds * 1000));

// The day is all a deployment needs, so the search stops at a window of blocks whose two ends fall on one day.
const search = async (query: DateQuery, node: CodeNode, deps: DiscoverDeps): Promise<DateResult> => {
  const source = sourceOf(query, node);
  const { firstBlocks, maxSteps } = deps.discover.sources.evmCode;
  const floor = firstBlocks[query.chain] ?? 0;
  const { head, headTime, perDay } = await clockOf(query, node, floor, deps);
  if (!(await node.hasCode(head))) return missing('no-code', source);
  // Code at the first block served means the contract is older than the history the node holds, so no day is given.
  if (floor > 0 && (await node.hasCode(floor)))
    return missing('history-truncated', source, { detail: `code already at block ${floor}, the first block served` });
  const window = Math.floor(perDay / WINDOWS_PER_DAY);
  const times = new Map<number, Promise<number>>([[head, Promise.resolve(headTime)]]);
  const timeOf = (block: number) => {
    if (!times.has(block)) times.set(block, node.blockTime(block));
    return times.get(block)!;
  };
  // The first block with code lies in [low, high].
  let [low, high] = [floor, head];
  for (let step = 0; ; step++) {
    if (high - low <= window) {
      const [first, last] = await Promise.all([timeOf(low), timeOf(high)]);
      if (dayAt(first) === dayAt(last))
        return low === high
          ? found(last, low, `${source}: first code at block ${low}`, 'first-code')
          : found(last, null, `${source}: first code in blocks ${low} to ${high}, all on that day`, 'first-code');
    }
    if (step >= maxSteps) return missing('page-cap', source);
    const middle = Math.floor((low + high) / 2);
    if (await node.hasCode(middle)) high = middle;
    else low = middle + 1;
  }
};

// Public nodes rarely serve past state, so a timeout there drops that chain's public node for the rest of the run.
export const firstCode = (query: DateQuery, deps: DiscoverDeps): Promise<DateResult> => {
  const node = nodeOf(query, deps);
  const source = sourceOf(query, node);
  const dropped = droppedOf(deps);
  if (!node.name && dropped.has(query.chain))
    return Promise.resolve(
      missing('code-search-timeout', source, { detail: `the public node of ${query.chain} timed out in this run` }),
    );
  return search(query, node, deps).catch((error: unknown) => {
    if (reasonOf(error) !== 'timeout') throw error;
    if (!node.name && !dropped.has(query.chain)) {
      dropped.add(query.chain);
      deps.log(`public node of ${query.chain} timed out: its addresses wait for the next run`);
    }
    return { ...missingOf(error, source), reason: 'code-search-timeout' };
  });
};
