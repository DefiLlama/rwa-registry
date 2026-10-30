/**
 * discover: ask the chains and the venues; `discover address <chain:address>` prints one address, `discover dates` sets the deployment dates and listing events it finds in the registry files.
 * @dev review: src/discover/discoverDates.ts, src/discover/discoverAddress.ts
 */
import type { Env } from '../../discover/discoverConfig';
import { discoverAddress, type AddressFacts } from '../../discover/discoverAddress';
import { discoverDates } from '../../discover/discoverDates';
import { buildDiscoverDeps, type DiscoverDeps } from '../../discover/discoverDeps';
import { CliError } from '../../errors';
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

const address: Action = async ({ args, json }, deps, print) => {
  const spec = args[1];
  if (!spec) {
    print('discover address needs <chain:address>');
    return 1;
  }
  const facts = await discoverAddress(spec, deps);
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

const dates: Action = async ({ registry: root, platform, chain, venue, limit, dryRun, json }, deps, print) => {
  const cap = typeof limit === 'string' ? Number(limit) : undefined;
  if (cap !== undefined && !(Number.isInteger(cap) && cap > 0)) {
    print(`discover dates: --limit ${String(limit)} is not a count`);
    return 1;
  }
  const summary = await discoverDates(
    registryOf(root),
    {
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
  for (const { file, path, date, source, basis } of summary.dated)
    print(`${dryRun ? 'would set' : 'set'} ${file} ${path} ${date} from ${source} (${basis})`);
  const files = new Set(summary.dated.map(({ file }) => file)).size;
  print(`asked ${summary.asked}, dated ${summary.dated.length}, files written ${dryRun ? '0 (dry run)' : files}`);
  for (const [reason, { count, detail }] of Object.entries(summary.nulls))
    print(`null ${reason} ${count}: ${detail ?? 'no detail'}`);
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
  description: 'ask the chains and venues: one address, or the deployment and listing dates, set in the registry files',
  arguments: '[action] [target]',
  help: 'Keys, each optional: ETHERSCAN_API_KEY, ALCHEMY_KEY, SOLSCAN_API_KEY, TONCENTER_API_KEY, PRO_API_KEY; without one the next source answers.',
  flags: [
    REGISTRY_FLAG,
    { spec: '--platform <slug>', description: 'dates: only the deployments of this platform' },
    { spec: '--chain <slug>', description: 'dates: only the deployments on this chain' },
    { spec: '--venue <slug>', description: 'dates: only the markets of this venue' },
    { spec: '--limit <n>', description: 'dates: at most n rows asked this run' },
    { spec: '--json', description: 'print JSON' },
    { spec: '--dry-run', description: 'dates: read and print what would be set, write nothing' },
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
