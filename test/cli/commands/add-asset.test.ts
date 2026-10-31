import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { addAsset, createAddAssetCommand } from '../../../src/cli/commands/add-asset';
import { readTemplate, TEMPLATES, templateFile } from '../../../src/cli/templates';
import type { CliCommand } from '../../../src/cli';
import type { DateQuery } from '../../../src/discover/dateReader';
import { found, missing } from '../../../src/discover/dateResult';
import { assetFile, baseTree, marketWith, writeTree, type Tree } from '../../fixtures/tree';
import { each, fakeAsk } from '../../fakes/prompter';
import { readJson, readText, runCli, templateCopy } from '../runCli';

const SOLANA = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const ETHEREUM = '0xC9CC8A4E3D4F0B5E2C1E1A54B7F6F2DE4E6A0B51';

const tree = (extra: Tree = {}) => ({
  ...baseTree(),
  'reference/underlyings/equity/nvidia-corporation.json': {
    slug: 'nvidia-corporation',
    name: 'NVIDIA Corporation',
    exposure: 'public-equities',
  },
  'reference/organizations/oracle/chainlink.json': { identity: { slug: 'chainlink', name: 'Chainlink' } },
  'reference/organizations/auditor/the-network-firm.json': {
    identity: { slug: 'the-network-firm', name: 'The Network Firm' },
  },
  'reference/organizations/tokenizer/backed-finance-ag.json': {
    identity: { slug: 'backed-finance-ag', name: 'Backed Finance AG' },
  },
  ...extra,
});

// The underlying templates/asset.json tracks.
const IONQ: Tree = {
  'reference/underlyings/equity/ionq-inc.json': { slug: 'ionq-inc', name: 'IonQ, Inc.', exposure: 'public-equities' },
};

const add = (
  root: string,
  symbol = 'NVDAx',
  deployments = [`solana:${SOLANA}:2025-06-30`, `ethereum:${ETHEREUM}:2025-07-01`],
) =>
  runCli([
    'add',
    'asset',
    '--registry',
    root,
    '--json',
    '--platform',
    'xstocks',
    '--symbol',
    symbol,
    '--name',
    'NVIDIA xStock',
    '--underlying',
    'nvidia-corporation',
    '--type',
    'asset',
    '--structure',
    'stock-backed',
    '--rwa-classification',
    'rwa',
    '--category',
    'stocks-equities',
    '--issuer',
    'backed-assets-je-limited',
    '--deployment',
    ...deployments,
  ]);

const runWith = async (command: CliCommand, root: string, deployment: string[], flags = {}) => {
  const lines: string[] = [];
  const options = {
    args: [],
    registry: root,
    json: true,
    platform: 'xstocks',
    symbol: 'NVDAx',
    name: 'NVIDIA xStock',
    underlying: 'nvidia-corporation',
    type: 'asset',
    structure: 'stock-backed',
    rwaClassification: 'rwa',
    category: ['stocks-equities'],
    issuer: 'backed-assets-je-limited',
    deployment,
    ...flags,
  };
  const code = await command.run(options, { print: (line) => lines.push(line) });
  return { code, lines };
};

const withIdentity = (fields: Record<string, unknown>) =>
  templateCopy('asset', (filled) => ({ ...filled, identity: { ...filled.identity, ...fields } }));

describe('add asset', () => {
  it('writes the asset file with the next legacy id above the export, its dated deployments and the defaults', async () => {
    const root = writeTree(tree());

    const { code, lines } = await add(root);
    const written = readJson(root, 'assets/xstocks/nvdax.json');

    expect(code).toBe(0);
    expect(written).toEqual({
      identity: { slug: 'nvdax', symbol: 'NVDAx', name: 'NVIDIA xStock', legacyId: 9718, canonicalMarketId: 'NVDAx' },
      exposure: { underlying: 'nvidia-corporation' },
      class: { structure: 'stock-backed', type: 'asset', rwaClassification: 'rwa', category: ['stocks-equities'] },
      review: { activeAumReviewed: false, suspicious: false, delisted: false },
      deployments: [
        { chain: 'solana', address: SOLANA, deployedAt: '2025-06-30', primary: true },
        { chain: 'ethereum', address: ETHEREUM.toLowerCase(), deployedAt: '2025-07-01' },
      ],
      roles: [{ organization: 'backed-assets-je-limited', kind: 'issuer' }],
    });
    expect(JSON.parse(lines.join('\n'))).toEqual({
      dryRun: false,
      files: [{ path: join(root, 'assets/xstocks/nvdax.json'), content: written }],
    });
  });

  it('takes one above the highest id the registry holds past the export, a market id counted too', async () => {
    const pastAsset = writeTree(tree({ 'assets/xstocks/amznx.json': assetFile('amznx', 9725) }));
    const pastMarket = writeTree(tree({ 'perps/xyz/tsla.json': marketWith({ legacyId: 9800 }) }));

    await add(pastAsset);
    await add(pastMarket);

    expect(
      [pastAsset, pastMarket].map((root) => readJson(root, 'assets/xstocks/nvdax.json').identity.legacyId),
    ).toEqual([9726, 9801]);
  });

  it('gives a case collision the -<legacyId> slug, as the lower id keeps the bare one', async () => {
    const root = writeTree(tree());

    const { code } = await add(root, 'TSLAX');

    expect(code).toBe(0);
    expect(readJson(root, 'assets/xstocks/tslax-9718.json').identity.canonicalMarketId).toBe('TSLAX');
  });

  it('keeps the slug and legacy id a template gives', async () => {
    const root = writeTree(tree(IONQ));

    const { code } = await runCli([
      'add',
      'asset',
      '--registry',
      root,
      '--from',
      withIdentity({ slug: 'ionq-xstock', legacyId: 258 }),
    ]);

    expect(code).toBe(0);
    expect(readJson(root, 'assets/xstocks/ionq-xstock.json').identity).toMatchObject({
      slug: 'ionq-xstock',
      legacyId: 258,
    });
  });

  it('refuses a template whose legacy id another asset holds, naming the id, and writes nothing', async () => {
    const root = writeTree(tree(IONQ));

    const { code, lines } = await runCli([
      'add',
      'asset',
      '--registry',
      root,
      '--from',
      withIdentity({ legacyId: 257 }),
      '--json',
    ]);

    expect(code).toBe(1);
    expect(lines).toEqual([`${join(root, 'assets/xstocks/tslax.json')}: legacyId 257 is also on asset ionqx`]);
    expect(existsSync(join(root, 'assets/xstocks/ionqx.json'))).toBe(false);
  });

  it('dates a deployment given without its date from the discover reader and notes the source', async () => {
    const root = writeTree(tree());
    const dated = found(1751155200, 5, 'https://explorer.solana.com/tx/sig0', 'first-signature');
    const dates = vi.fn(async (queries: DateQuery[]) => queries.map(() => dated));
    const command = createAddAssetCommand({ reads: () => ({ dates, listings: vi.fn() }) });

    const { code, lines } = await runWith(command, root, [`solana:${SOLANA}`, `ethereum:${ETHEREUM}:2025-07-01`]);

    expect(code).toBe(0);
    expect(dates).toHaveBeenCalledWith([{ chain: 'solana', address: SOLANA }]);
    expect(readJson(root, 'assets/xstocks/nvdax.json').deployments[0].deployedAt).toBe('2025-06-29');
    expect(JSON.parse(lines.join('\n')).notes).toEqual([
      `solana:${SOLANA}: deployedAt 2025-06-29 from https://explorer.solana.com/tx/sig0 (first-signature)`,
    ]);
  });

  it('refuses an undated deployment the reader cannot date', async () => {
    const root = writeTree(tree());
    const dates = vi.fn(async (queries: DateQuery[]) => queries.map(() => missing('page-cap', 'getSignatures')));
    const command = createAddAssetCommand({ reads: () => ({ dates, listings: vi.fn() }) });

    const { lines } = await runWith(command, root, [`solana:${SOLANA}`]);

    expect(lines).toEqual([
      `add asset: solana:${SOLANA}: no deployment date (page-cap: getSignatures); pass :<YYYY-MM-DD>`,
    ]);
    expect(existsSync(join(root, 'assets/xstocks/nvdax.json'))).toBe(false);
  });

  it('leaves a deployment undated under --no-discover, asks no chain, and notes that validate warns', async () => {
    const root = writeTree(tree());
    const dates = vi.fn();
    const command = createAddAssetCommand({ reads: () => ({ dates, listings: vi.fn() }) });

    const { code, lines } = await runWith(command, root, [`solana:${SOLANA}`], { discover: false });
    const validated = await runCli(['validate', '--registry', root]);

    expect(code).toBe(0);
    expect(dates).not.toHaveBeenCalled();
    expect(JSON.parse(lines.join('\n')).notes).toEqual([
      `solana:${SOLANA}: left undated under --no-discover; validate warns undated-deployment until deployedAt is set`,
    ]);
    expect(readJson(root, 'assets/xstocks/nvdax.json').deployments).toEqual([
      { chain: 'solana', address: SOLANA, primary: true },
    ]);
    expect(validated.lines).toEqual([expect.stringMatching(/^warning: undated-deployment: 1 /)]);
  });

  it('leaves a deployment given as unknown undated, asks no chain, and notes it', async () => {
    const root = writeTree(tree());
    const dates = vi.fn();
    const command = createAddAssetCommand({ reads: () => ({ dates, listings: vi.fn() }) });

    const { code, lines } = await runWith(command, root, [`solana:${SOLANA}:unknown`]);

    expect(code).toBe(0);
    expect(dates).not.toHaveBeenCalled();
    expect(JSON.parse(lines.join('\n')).notes).toEqual([
      `solana:${SOLANA}: left undated as given; validate warns undated-deployment until deployedAt is set`,
    ]);
  });

  it('writes from templates/asset.json the file the flags write, roles included', async () => {
    const byFlags = writeTree(tree(IONQ));
    const byFile = writeTree(tree(IONQ));
    const template = readTemplate(templateFile('asset'), TEMPLATES.asset) as Record<string, any>;
    const [issuer, ...others] = template.roles;
    const tokenizer = { organization: 'backed-finance-ag', kind: 'tokenizer' };
    // The flags give a deployment only with its address, so the template's chain with no known contract stays out.
    const contracts = template.deployments.filter((row: Record<string, string | null>) => row.address !== null);
    const flagsOnly = templateCopy('asset', (filled) => ({
      ...filled,
      deployments: filled.deployments
        .filter((deployment: { address: string | null }) => deployment.address !== null)
        .map((deployment: object) => ({ ...deployment, labels: null })),
      roles: [issuer, tokenizer, ...others],
      events: null,
    }));
    const roleOf = (kind: string) => template.roles.find((role: { kind: string }) => role.kind === kind).organization;
    const flags = Object.entries({
      platform: template.platform,
      symbol: template.symbol,
      name: template.name,
      underlying: template.underlying,
      type: template.type,
      structure: template.structure,
      'rwa-classification': template.rwaClassification,
      issuer: issuer.organization,
      'issuer-source': issuer.sourceLinks[0],
      tokenizer: tokenizer.organization,
      oracle: roleOf('oracle'),
      auditor: roleOf('auditor'),
    }).flatMap(([flag, value]) => [`--${flag}`, value]);
    const deployments = contracts.map((row: Record<string, string>) =>
      [row.chain, row.address, row.deployedAt].join(':'),
    );

    await runCli([
      'add',
      'asset',
      '--registry',
      byFlags,
      ...flags,
      '--category',
      ...template.category,
      '--deployment',
      ...deployments,
    ]);
    const { code } = await runCli(['add', 'asset', '--registry', byFile, '--from', flagsOnly]);

    expect(code).toBe(0);
    expect(readJson(byFlags, 'assets/xstocks/ionqx.json').roles.map(({ kind }: { kind: string }) => kind)).toEqual([
      'issuer',
      'tokenizer',
      'oracle',
      'auditor',
    ]);
    expect(readText(byFile, 'assets/xstocks/ionqx.json')).toBe(readText(byFlags, 'assets/xstocks/ionqx.json'));
  });

  it('keeps from the template the label and event the flags cannot give', async () => {
    const root = writeTree(tree(IONQ));

    const { code } = await runCli([
      'add',
      'asset',
      '--registry',
      root,
      '--from',
      templateCopy('asset', (filled) => filled),
    ]);
    const written = readJson(root, 'assets/xstocks/ionqx.json');

    expect(code).toBe(0);
    expect(written.deployments[0].labels).toEqual([{ address: expect.any(String), kind: 'excluded-holder' }]);
    expect(written.events).toEqual([{ kind: 'listing', date: expect.any(String), links: [expect.any(String)] }]);
  });
});

describe('add asset, asked', () => {
  it('asks the required fields in dependency order, the chain and address before the day discover offers, then the optional ones block by block, and writes the answers', async () => {
    const root = writeTree(tree());
    const dated = found(1751155200, 5, 'https://explorer.solana.com/tx/sig0', 'first-signature');
    const dates = vi.fn(async (queries: DateQuery[]) => queries.map(() => dated));
    const command = createAddAssetCommand({ reads: () => ({ dates, listings: vi.fn() }) });
    const prompter = fakeAsk({
      platform: 'xstocks',
      underlying: 'nvidia-corporation',
      symbol: 'NVDAx',
      name: 'NVIDIA xStock',
      'deployment.chain': 'solana',
      'deployment.address': SOLANA,
      category: ['stocks-equities'],
      type: 'asset',
      structure: 'stock-backed',
      rwaClassification: 'rwa',
      redeemable: 'true',
      issuer: 'backed-assets-je-limited',
    });

    const code = await command.run(
      { args: [], registry: root, discover: true },
      { print: () => undefined, ask: prompter.ask },
    );
    const offered = prompter.asked.find((question) => question.key === 'deployment.deployedAt')!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual([
      'platform',
      'underlying',
      'symbol',
      'name',
      'deployment.chain',
      'deployment.address',
      'deployment.deployedAt',
      'deployment.more',
      'category',
      'type',
      'structure',
      'rwaClassification',
      'issuer',
      'canonicalMarketId',
      'wraps',
      'stablecoinOverride',
      'governanceOverride',
      'redeemable',
      'cexListed',
      'kycForMintRedeem',
      'kycToTransferHold',
      'transferable',
      'selfCustody',
      'yieldBearing',
      'attestationFrequency',
      'coingeckoId',
      'protocolIds',
      'yieldPoolIds',
      'identifiers',
      'documents',
      'description',
      'logo',
      'linksWebsite',
      'issuerSource',
      'tokenizer',
      'oracle',
      'auditor',
      'otherRole.kind',
      'confirm',
    ]);
    expect(offered).toMatchObject({ default: '2025-06-29' });
    expect(dates).toHaveBeenCalledWith([{ chain: 'solana', address: SOLANA }]);
    expect(prompter.asked.at(-1)!.message).toContain('legacy id: 9718 (assigned)');
    expect(readJson(root, 'assets/xstocks/nvdax.json')).toMatchObject({
      identity: { slug: 'nvdax', legacyId: 9718, canonicalMarketId: 'NVDAx' },
      terms: { redeemable: true },
      deployments: [{ chain: 'solana', address: SOLANA, deployedAt: '2025-06-29', primary: true }],
    });
  });

  it('asks the categories, and asks again with a hint when the answer is empty, instead of refusing at the end', async () => {
    const root = writeTree(tree());
    const prompter = fakeAsk({ category: each([], ['stocks-equities']) });
    const flags = {
      platform: 'xstocks',
      symbol: 'NVDAx',
      name: 'NVIDIA xStock',
      underlying: 'nvidia-corporation',
      type: 'asset',
      structure: 'stock-backed',
      rwaClassification: 'rwa',
      issuer: 'backed-assets-je-limited',
      deployment: [`solana:${SOLANA}:2025-06-30`],
    };

    const code = await addAsset.run(
      { args: [], registry: root, ...flags },
      { print: () => undefined, ask: prompter.ask },
    );
    const asked = prompter.asked.filter((question) => question.key === 'category');

    expect(asked).toHaveLength(2);
    expect(asked[0]!.message).toMatch(/^Which categories/);
    expect(asked[1]!.message).toContain('required');
    expect(code).toBe(0);
    expect(readJson(root, 'assets/xstocks/nvdax.json').class.category).toEqual(['stocks-equities']);
  });

  it('takes the default of a yes or no term on Enter, and leaves an override derived', async () => {
    const root = writeTree(tree());
    const prompter = fakeAsk({ category: ['stocks-equities'] });
    const flags = {
      platform: 'xstocks',
      symbol: 'NVDAx',
      name: 'NVIDIA xStock',
      underlying: 'nvidia-corporation',
      type: 'asset',
      structure: 'stock-backed',
      rwaClassification: 'rwa',
      issuer: 'backed-assets-je-limited',
      deployment: [`solana:${SOLANA}:2025-06-30`],
    };

    const code = await addAsset.run(
      { args: [], registry: root, ...flags },
      { print: () => undefined, ask: prompter.ask },
    );
    const question = (key: string) => prompter.asked.find((asked) => asked.key === key)!;
    const file = readJson(root, 'assets/xstocks/nvdax.json');

    expect(code).toBe(0);
    expect(question('transferable').message).toBe('Can the token move between wallets? (yes or no, default yes)');
    expect(question('stablecoinOverride').message).toBe(
      'Override the stablecoin flag? (Enter to leave it derived; yes or no to force it)',
    );
    expect(question('coingeckoId').message).toBe(
      'What is its CoinGecko id? (example: tesla-xstock; Enter to leave empty)',
    );
    expect(prompter.keys()).not.toContain('flagReason');
    expect(file.terms).toMatchObject({ transferable: true, cexListed: false, yieldBearing: false });
    expect(file.class.stablecoinOverride).toBeUndefined();
    expect(file.sources?.coingeckoId).toBeUndefined();
    expect(prompter.asked.at(-1)!.message).toContain('moves between wallets: yes');
  });
});
