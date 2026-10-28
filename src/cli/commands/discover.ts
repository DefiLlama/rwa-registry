/**
 * discover: ask the chains and the venues; `discover address <chain:address>` prints one address, `discover dates` writes the deployedAt and listing patch rows.
 * @dev review: src/discover/discoverDates.ts, src/discover/discoverAddress.ts
 */
import type { Env } from '../../config/loadConfig';
import { discoverAddress, type AddressFacts } from '../../discover/discoverAddress';
import { discoverDates } from '../../discover/discoverDates';
import { buildDiscoverDeps, type DiscoverDeps } from '../../discover/discoverDeps';
import { CliError } from '../../errors';
import { loadRegistry } from '../../registry';
import type { CliCommand, CliDeps } from '../index';
import { REGISTRY_FLAG, registryOf } from '../registryFlag';

type Options = Parameters<CliCommand['run']>[0];
type Action = (options: Options, deps: DiscoverDeps, print: CliDeps['print']) => Promise<number>;

const FACTS: (keyof AddressFacts)[] = [
  'symbol',
  'name',
  'decimals',
  'totalSupply',
  'deployedAt',
  'block',
  'basis',
  'source',
  'reason',
  'detail',
];

const address: Action = async ({ args, registry: root, json }, deps, print) => {
  const spec = args[1];
  if (!spec) {
    print('discover address needs <chain:address>');
    return 1;
  }
  const facts = await discoverAddress(loadRegistry(registryOf(root)).registry, spec, deps);
  if (json) print(JSON.stringify(facts, null, 2));
  else
    [`${facts.chain}:${facts.address}`, ...FACTS.map((field) => `  ${field}: ${facts[field] ?? 'null'}`)].forEach(
      print,
    );
  return 0;
};

const counts = (byReason: Partial<Record<string, number>>) =>
  Object.entries(byReason)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ') || 'none';

const dates: Action = async ({ registry: root, out, platform, chain, venue, limit, dryRun, json }, deps, print) => {
  if (typeof out !== 'string') {
    print('discover dates needs --out <file.csv>');
    return 1;
  }
  const cap = typeof limit === 'string' ? Number(limit) : undefined;
  if (cap !== undefined && !(Number.isInteger(cap) && cap > 0)) {
    print(`discover dates: --limit ${String(limit)} is not a count`);
    return 1;
  }
  const summary = await discoverDates(
    loadRegistry(registryOf(root)).registry,
    {
      out,
      platform: typeof platform === 'string' ? platform : undefined,
      chain: typeof chain === 'string' ? chain : undefined,
      venue: typeof venue === 'string' ? venue : undefined,
      limit: cap,
      dryRun: dryRun === true,
    },
    deps,
  );
  if (json) {
    print(JSON.stringify(summary, null, 2));
    return 0;
  }
  print(
    `asked ${summary.asked}, dated ${summary.found}, rows ${dryRun ? 'not written' : 'written'} ${summary.rows.length}, held before ${summary.held}`,
  );
  for (const [reason, { count, fate, detail }] of Object.entries(summary.nulls))
    print(`null ${reason} ${count}, ${fate}: ${detail ?? 'no detail'}`);
  for (const [name, { asked, found, nulls, seconds }] of Object.entries(summary.lanes))
    print(`lane ${name}: asked ${asked}, dated ${found}, nulls ${counts(nulls)}, ${seconds} s`);
  for (const [name, { calls, failed, seconds }] of Object.entries(summary.sources))
    print(`source ${name}: ${calls} calls, failed ${counts(failed)}, ${seconds} s`);
  return 0;
};

const ACTIONS: Record<string, Action> = { address, dates };

export const createDiscoverCommand = (deps: {
  env: Env;
  deps?: (env: Env, log: CliDeps['print']) => DiscoverDeps;
}): CliCommand => ({
  name: 'discover',
  description: 'ask the chains and venues: one address, or the deployment and listing dates as a patch file',
  arguments: '[action] [target]',
  help: 'Keys, each optional: ETHERSCAN_API_KEY, ALCHEMY_KEY, SOLSCAN_API_KEY, TONCENTER_API_KEY, PRO_API_KEY; without one the next source answers.',
  flags: [
    REGISTRY_FLAG,
    { spec: '--platform <slug>', description: 'dates: only the deployments of this platform' },
    { spec: '--chain <slug>', description: 'dates: only the deployments on this chain' },
    { spec: '--venue <slug>', description: 'dates: only the markets of this venue' },
    { spec: '--limit <n>', description: 'dates: at most n rows asked this run' },
    { spec: '--out <file>', description: 'dates: the patch csv to append to; the rows it holds are skipped' },
    { spec: '--json', description: 'print JSON' },
    { spec: '--dry-run', description: 'dates: read and print, write nothing' },
  ],
  run: async (options, { print }) => {
    const action = ACTIONS[options.args[0] ?? ''];
    if (!action) {
      print('discover needs address <chain:address> or dates');
      return 1;
    }
    try {
      return await action(options, (deps.deps ?? buildDiscoverDeps)(deps.env, print), print);
    } catch (error) {
      if (error instanceof CliError) print(`${error.file}: ${error.message}`);
      else throw error;
      return 1;
    }
  },
});

export const discover = createDiscoverCommand({ env: process.env });
