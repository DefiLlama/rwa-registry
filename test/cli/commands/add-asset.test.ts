import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAddAssetCommand } from '../../../src/cli/commands/add-asset';
import type { CliCommand } from '../../../src/cli';
import type { DateQuery } from '../../../src/discover/dateReader';
import { found, missing } from '../../../src/discover/dateResult';
import { toRow } from '../../../src/schema';
import { assetFile, baseTree, marketWith, writeTree, type Tree } from '../../fixtures/tree';
import { readJson, readTemplate, readText, runCli, templateCopy } from '../runCli';

const SOLANA = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const ETHEREUM = '0xC9CC8A4E3D4F0B5E2C1E1A54B7F6F2DE4E6A0B51';

const tree = (extra: Tree = {}) => ({
  ...baseTree(),
  'reference/underlyings/equity/nvidia-corporation.json': {
    slug: 'nvidia-corporation',
    name: 'NVIDIA Corporation',
    exposure: 'public-equities',
  },
  'reference/vocabularies/role-kind.json': ['issuer', 'tokenizer', 'oracle', 'auditor'].map((slug) => ({
    slug,
    label: slug,
  })),
  'reference/vocabularies/organization-kind.json': [
    'auditor',
    'issuer',
    'oracle',
    'platform',
    'tokenizer',
    'venue-operator',
  ].map((slug) => ({ slug, label: slug })),
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
    'true-rwa',
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
    rwaClassification: 'true-rwa',
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
      class: { structure: 'stock-backed', type: 'asset', rwaClassification: 'true-rwa' },
      review: { activeAumReviewed: false },
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
    expect(lines).toEqual([
      `${join(root, 'assets/xstocks/tslax.json')}: legacyId 257 is also on asset ionqx`,
      `${join(root, 'assets/xstocks/ionqx.json')}: legacyId 257 moved from tslax to ionqx`,
    ]);
    expect(existsSync(join(root, 'assets/xstocks/ionqx.json'))).toBe(false);
  });

  it('dates a deployment given without its date from the discover reader and notes the source', async () => {
    const root = writeTree(tree());
    const dated = found(1751155200, 5, 'https://explorer.solana.com/tx/sig0', 'first-signature');
    const dates = vi.fn(async (queries: DateQuery[]) => queries.map(() => dated));
    const command = createAddAssetCommand({ reads: () => ({ dates, listings: vi.fn() }) });

    const { code, lines } = await runWith(command, root, [`solana:${SOLANA}`, `ethereum:${ETHEREUM}:2025-07-01`]);

    expect(code).toBe(0);
    expect(dates).toHaveBeenCalledWith([{ chain: 'solana', chainId: 'solana', family: 'solana', address: SOLANA }]);
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

  it('writes from templates/asset.json the file the flags write, roles included', async () => {
    const byFlags = writeTree(tree(IONQ));
    const byFile = writeTree(tree(IONQ));
    const { platform, ...file } = readTemplate('asset');
    const template = { platform, ...toRow('asset', file) } as Record<string, any>;
    const [issuer, ...others] = template.roles;
    const tokenizer = { organization: 'backed-finance-ag', kind: 'tokenizer' };
    const flagsOnly = templateCopy('asset', (filled) => ({
      ...filled,
      deployments: filled.deployments.map((deployment: object) => ({ ...deployment, labels: null })),
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
    const deployments = template.deployments.map((row: Record<string, string>) =>
      [row.chain, row.address, row.deployedAt].join(':'),
    );

    await runCli(['add', 'asset', '--registry', byFlags, ...flags, '--deployment', ...deployments]);
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
