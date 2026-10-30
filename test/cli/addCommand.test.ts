import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { baseTree, tslaxWith, writeTree } from '../fixtures/tree';
import { readJson, runCli, templateCopy } from './runCli';

const NEW = 'assets/xstocks/nvdax.json';

const tree = () => ({
  ...baseTree(),
  'reference/underlyings/equity/nvidia-corporation.json': {
    slug: 'nvidia-corporation',
    name: 'NVIDIA Corporation',
    exposure: 'public-equities',
  },
});

const asset = (root: string, without: string[] = []) => {
  const flags: Record<string, string[]> = {
    '--platform': ['xstocks'],
    '--symbol': ['NVDAx'],
    '--name': ['NVIDIA xStock'],
    '--underlying': ['nvidia-corporation'],
    '--type': ['asset'],
    '--structure': ['stock-backed'],
    '--rwa-classification': ['rwa'],
    '--category': ['stocks-equities'],
    '--issuer': ['backed-assets-je-limited'],
    '--deployment': ['solana:Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh:2025-06-30'],
  };
  const kept = Object.entries(flags).filter(([flag]) => !without.includes(flag));
  return ['add', 'asset', '--registry', root, ...kept.flat(2)];
};

describe('the add flow', () => {
  it('asks for a missing required flag and writes the answer', async () => {
    const root = writeTree(tree());
    const ask = vi.fn(async () => 'NVDAx');

    const { code } = await runCli(asset(root, ['--symbol']), ask);

    expect(code).toBe(0);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ key: 'symbol' }));
    expect(readJson(root, NEW).identity.symbol).toBe('NVDAx');
  });

  it('asks for the issuer by organization name and writes the issuer role', async () => {
    const root = writeTree(tree());
    const ask = vi.fn(async () => 'backed-assets-je-limited');

    const { code } = await runCli(asset(root, ['--issuer']), ask);

    expect(code).toBe(0);
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'issuer',
        choices: expect.arrayContaining([{ value: 'backed-assets-je-limited', name: 'Backed Assets (JE) Limited' }]),
      }),
    );
    expect(readJson(root, NEW).roles).toEqual([{ organization: 'backed-assets-je-limited', kind: 'issuer' }]);
  });

  it('names a missing required flag under --json, never asks and writes nothing', async () => {
    const root = writeTree(tree());
    const ask = vi.fn(async () => 'NVDAx');

    const { code, lines } = await runCli([...asset(root, ['--symbol']), '--json'], ask);

    expect(code).toBe(1);
    expect(ask).not.toHaveBeenCalled();
    expect(lines).toEqual([expect.stringContaining('--symbol')]);
    expect(existsSync(join(root, NEW))).toBe(false);
  });

  it('refuses a row the registry checks reject and writes nothing', async () => {
    const root = writeTree(tree());

    const { code, lines } = await runCli([...asset(root, ['--underlying']), '--underlying', 'nvidia-corp', '--json']);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(new RegExp(`^${join(root, NEW)}: .*nvidia-corp`, 'm'));
    expect(existsSync(join(root, NEW))).toBe(false);
  });

  it('refuses only the errors the new files bring, not the ones already in the registry', async () => {
    const root = writeTree({ ...tree(), 'assets/xstocks/tslax.json': tslaxWith({ underlying: 'tesla-incc' }) });

    const { code } = await runCli([...asset(root), '--json']);

    expect(code).toBe(0);
    expect(existsSync(join(root, NEW))).toBe(true);
  });

  it('--dry-run checks and prints the file without writing it', async () => {
    const root = writeTree(tree());

    const { code, lines } = await runCli([...asset(root), '--dry-run']);

    expect(code).toBe(0);
    expect(lines[0]).toBe(`would write ${join(root, NEW)}`);
    expect(JSON.parse(lines.slice(1).join('\n')).identity.slug).toBe('nvdax');
    expect(existsSync(join(root, NEW))).toBe(false);
  });

  it('never overwrites a file that exists', async () => {
    const root = writeTree(tree());

    const { code, lines } = await runCli([
      'add',
      'underlying',
      '--registry',
      root,
      '--name',
      'Tesla, Inc.',
      '--exposure',
      'public-equities',
    ]);
    const path = 'reference/underlyings/equity/tesla-inc.json';

    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringMatching(new RegExp(`^${join(root, path)}: `))]);
    expect(readJson(root, path)).toEqual(baseTree()[path]);
  });

  it('refuses a path a flag would put outside the registry', async () => {
    const root = writeTree(tree());

    const { code } = await runCli([...asset(root, ['--platform']), '--platform', '../../escape', '--json']);

    expect(code).toBe(1);
    expect(existsSync(join(root, '../escape'))).toBe(false);
  });
});

const contents = (root: string) =>
  Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [join(entry.parentPath, entry.name), readFileSync(join(entry.parentPath, entry.name), 'utf8')]),
  );

const swap = (argv: string[], flag: string, value: string) =>
  argv.map((item, i) => (argv[i - 1] === flag ? value : item));

const fromAsset = (change: (template: Record<string, any>) => Record<string, any>) => [
  ...['add', 'asset', '--from', templateCopy('asset', change), '--no-discover'],
];

const REFUSALS: [string, (root: string) => string[], string][] = [
  [
    'an asset whose symbol another asset holds',
    (root) => swap(asset(root), '--symbol', 'TSLAx'),
    'assets/xstocks/tslax.json: asset canonicalMarketId TSLAx is also on asset tslax-9718',
  ],
  [
    'an asset whose issuer is not an organization',
    (root) => swap(asset(root), '--issuer', 'backed-labs'),
    'add asset: issuer backed-labs is not an organization; add it first with add organization',
  ],
  [
    'an asset template without an issuer role',
    () => fromAsset((template) => ({ ...template, roles: [] })),
    'add asset: an asset needs an issuer role; pass --issuer or add one to roles',
  ],
  [
    'a value for a vocabulary that does not exist',
    () => ['add', 'value', '--vocabulary', 'asset-kind', '--label', 'Claim'],
    'reference/vocabularies/asset-kind.json: asset-kind is not a vocabulary',
  ],
  [
    'a template without a field the file path is made from',
    () => fromAsset((template) => ({ ...template, platform: null })),
    'asset.json: platform is required',
  ],
  [
    'a template file that cannot be read',
    () => ['add', 'underlying', '--from', '/nonexistent/underlying.json'],
    '/nonexistent/underlying.json: cannot read the template: ',
  ],
  [
    'a table flag given beside --from',
    () => [...fromAsset((template) => template), '--symbol', 'NVDAx'],
    'add asset: --symbol is given beside --from; put it in the file',
  ],
];

describe('what an add refuses', () => {
  it.each(REFUSALS)('%s: prints why, writes nothing and exits 1', async (_, argv, line) => {
    const root = writeTree(tree());
    const before = contents(root);

    const { code, lines } = await runCli([...argv(root), '--registry', root, '--json']);

    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringContaining(line)]);
    expect(contents(root)).toEqual(before);
  });
});
