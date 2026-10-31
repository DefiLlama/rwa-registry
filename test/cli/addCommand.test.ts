import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { INTRO } from '../../src/cli/questionnaire';
import { fakeAsk } from '../fakes/prompter';
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
  it('asks only the fields no flag gives, then writes the answers once confirmed', async () => {
    const root = writeTree(tree());
    const prompter = fakeAsk({ symbol: 'NVDAx' });

    const { code } = await runCli(asset(root, ['--symbol']), prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toContain('symbol');
    expect(prompter.keys()).not.toContain('platform');
    expect(prompter.keys().at(-1)).toBe('confirm');
    expect(readJson(root, NEW).identity.symbol).toBe('NVDAx');
  });

  it('asks for the issuer by organization name and writes the issuer role', async () => {
    const root = writeTree(tree());
    const prompter = fakeAsk({ issuer: 'backed-assets-je-limited' });

    const { code } = await runCli(asset(root, ['--issuer']), prompter.ask);
    const issuer = prompter.asked.find((question) => question.key === 'issuer')!;

    expect(code).toBe(0);
    expect(issuer.choices).toEqual(
      expect.arrayContaining([{ value: 'backed-assets-je-limited', name: 'Backed Assets (JE) Limited' }]),
    );
    expect(readJson(root, NEW).roles).toEqual([{ organization: 'backed-assets-je-limited', kind: 'issuer' }]);
  });

  it('asks the fields no flag has, each with what it asks for, and writes the answers in their blocks', async () => {
    const root = writeTree({
      ...tree(),
      'reference/vocabularies/role-kind.json': [
        { slug: 'custodian', label: 'custodian' },
        { slug: 'issuer', label: 'issuer' },
      ],
    });
    const prompter = fakeAsk({
      description: 'NVIDIA shares as a token.',
      logo: 'https://icons.example/nvdax.png',
      linksWebsite: 'https://xstocks.fi/nvdax',
      identifiers: 'isin:US67066G1040',
      protocolIds: '2525, parent#xstocks',
      'otherRole.kind': 'custodian',
      'otherRole.organization': 'backed-assets-je-limited',
    });

    const { code, lines } = await runCli(asset(root), prompter.ask);
    const written = readJson(root, NEW);
    const description = prompter.asked.find((question) => question.key === 'description')!;

    expect(code, lines.join('\n')).toBe(0);
    expect(description).toMatchObject({
      message: 'How would you describe it in a sentence or two?',
      lines: expect.arrayContaining(['What it does, in plain words, for the page that shows it.']),
    });
    expect(prompter.keys()).toEqual(expect.arrayContaining(['wraps', 'documents', 'yieldPoolIds', 'otherRole.more']));
    expect(written.about).toEqual({
      description: 'NVIDIA shares as a token.',
      logo: 'https://icons.example/nvdax.png',
      links: { website: ['https://xstocks.fi/nvdax'] },
    });
    expect(written.sources).toMatchObject({
      identifiers: [{ scheme: 'isin', value: 'US67066G1040' }],
      protocolIds: [2525, 'parent#xstocks'],
    });
    expect(written.roles).toEqual([
      { organization: 'backed-assets-je-limited', kind: 'issuer' },
      { organization: 'backed-assets-je-limited', kind: 'custodian' },
    ]);
  });

  it('writes nothing when the person answers no at the confirmation', async () => {
    const root = writeTree(tree());
    const prompter = fakeAsk({ symbol: 'NVDAx', confirm: false });

    const { code, lines } = await runCli(asset(root, ['--symbol']), prompter.ask);

    expect(code).toBe(1);
    expect(lines).toEqual([INTRO, 'add asset: cancelled; nothing written']);
    expect(existsSync(join(root, NEW))).toBe(false);
  });

  it('asks only what a --from template leaves empty, and the answers fill it', async () => {
    const root = writeTree({
      ...tree(),
      'reference/underlyings/equity/ionq-inc.json': {
        slug: 'ionq-inc',
        name: 'IonQ, Inc.',
        exposure: 'public-equities',
      },
    });
    const template = templateCopy('asset', (filled) => ({
      ...filled,
      identity: { ...filled.identity, name: null },
      roles: filled.roles.slice(0, 1),
    }));
    const prompter = fakeAsk({ name: 'IonQ Tokenized' });

    const { code } = await runCli(['add', 'asset', '--registry', root, '--from', template], prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toContain('name');
    expect(prompter.keys()).not.toContain('symbol');
    expect(prompter.keys()).not.toContain('issuer');
    expect(readJson(root, 'assets/xstocks/ionqx.json').identity.name).toBe('IonQ Tokenized');
  });

  it('asks a field with no flag that a --from template leaves empty, and the answer fills its block', async () => {
    const root = writeTree({
      ...tree(),
      'reference/underlyings/equity/ionq-inc.json': {
        slug: 'ionq-inc',
        name: 'IonQ, Inc.',
        exposure: 'public-equities',
      },
    });
    const template = templateCopy('asset', (filled) => ({
      ...filled,
      about: { description: 'IonQ shares as a token.', logo: null, links: { website: null } },
      roles: filled.roles.slice(0, 1),
    }));
    const prompter = fakeAsk({ linksWebsite: 'https://xstocks.fi/ionqx' });

    const { code, lines } = await runCli(['add', 'asset', '--registry', root, '--from', template], prompter.ask);

    expect(code, lines.join('\n')).toBe(0);
    expect(prompter.keys()).not.toContain('description');
    expect(readJson(root, 'assets/xstocks/ionqx.json').about).toEqual({
      description: 'IonQ shares as a token.',
      links: { website: ['https://xstocks.fi/ionqx'] },
    });
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
    'add asset: --issuer backed-labs: no organization backed-labs in the registry; add it first with add organization',
  ],
  [
    'an asset template without an issuer role',
    () => fromAsset((template) => ({ ...template, roles: [] })),
    'add asset: an asset needs an issuer role; pass --issuer or add one to roles',
  ],
  [
    'a value for a vocabulary that does not exist',
    () => ['add', 'value', '--vocabulary', 'asset-kind', '--label', 'Claim'],
    'add value: --vocabulary asset-kind: not in the list',
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
