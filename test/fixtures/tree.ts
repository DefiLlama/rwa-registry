/**
 * The small hand-built registry every registry test starts from: TSLAx under xstocks and xyz:TSLA on trade[XYZ].
 * @dev review: test/registry/loadRegistry.test.ts
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadRegistry, type Problem } from '../../src/registry';
import { toFile, toRow, type Registry } from '../../src/schema';

export type Tree = Record<string, unknown>;

const values = (...slugs: [string, string][]) => slugs.map(([slug, label]) => ({ slug, label }));

export const tslaxFile = () => ({
  identity: { slug: 'tslax', symbol: 'TSLAx', name: 'Tesla xStock', legacyId: 257, canonicalMarketId: 'TSLAx' },
  exposure: { underlying: 'tesla-inc' },
  class: { structure: 'stock-backed', type: 'asset', rwaClassification: 'true-rwa', category: ['stocks-equities'] },
  review: { activeAumReviewed: true },
  deployments: [
    {
      chain: 'solana',
      address: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
      deployedAt: '2025-06-30',
      primary: true,
      labels: [{ address: 'S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS', kind: 'excluded-holder' }],
    },
    { chain: 'ethereum', address: '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0', deployedAt: '2025-06-30' },
  ],
  roles: [{ organization: 'backed-assets-je-limited', kind: 'issuer' }],
});

export const undatedTslax = () => {
  const tslax = tslaxFile();
  return { ...tslax, deployments: tslax.deployments.map((deployment) => ({ ...deployment, deployedAt: null })) };
};

// TSLAx with some fields changed, the fields named as the row names them, written back in the file shape.
export const tslaxWith = (fields: Record<string, unknown>) =>
  toFile('asset', { ...toRow('asset', tslaxFile()), ...fields });

export const tslaMarketFile = () => ({
  identity: { symbol: 'TSLA', legacyId: 2921 },
  tracks: { underlying: 'tesla-inc', structure: 'stock-perp' },
});

export const marketWith = (fields: Record<string, unknown>) =>
  toFile('perp_market', { ...toRow('perp_market', tslaMarketFile()), ...fields });

export const baseTree = (): Tree => ({
  'reference/vocabularies/type.json': values(['asset', 'Asset'], ['wrapper', 'Wrapper']),
  'reference/vocabularies/category.json': values(['stocks-equities', 'Stocks & Equities'], ['rwa-perps', 'RWA Perps']),
  'reference/vocabularies/asset-class.json': values(['stock-backed', 'Stock-Backed'], ['stock-perp', 'Stock Perp']),
  'reference/vocabularies/asset-group.json': [
    { slug: 'public-equities', label: 'Public Equities', class: 'equity' },
    { slug: 'precious-metals', label: 'Precious Metals', class: 'commodity' },
  ],
  'reference/vocabularies/rwa-classification.json': values(
    ['true-rwa', 'True RWA'],
    ['programmable-finance', 'Programmable Finance'],
  ),
  'reference/vocabularies/access-model.json': values(['permissionless', 'Permissionless']),
  'reference/vocabularies/venue-type.json': values(['dex', 'dex'], ['cex', 'cex']),
  'reference/vocabularies/organization-kind.json': values(
    ['issuer', 'issuer'],
    ['oracle', 'oracle'],
    ['platform', 'platform'],
    ['venue-operator', 'venue-operator'],
  ),
  'reference/vocabularies/role-kind.json': values(['issuer', 'issuer'], ['oracle', 'oracle'], ['auditor', 'auditor']),
  'reference/vocabularies/event-kind.json': values(
    ['delisting', 'delisting'],
    ['listing', 'listing'],
    ['split', 'split'],
    ['paused', 'paused'],
    ['resumed', 'resumed'],
    ['review', 'review'],
    ['merge', 'merge'],
  ),
  'reference/vocabularies/label-kind.json': values(['excluded-holder', 'excluded-holder']),
  'reference/underlyings/equity/tesla-inc.json': {
    slug: 'tesla-inc',
    name: 'Tesla, Inc.',
    ticker: 'TSLA',
    exposure: 'public-equities',
  },
  'reference/organizations/issuer/backed-assets-je-limited.json': {
    identity: { slug: 'backed-assets-je-limited', name: 'Backed Assets (JE) Limited' },
  },
  'perps/xyz/organization.json': { identity: { slug: 'trade-xyz', name: 'trade[XYZ]', legacyPid: 219 } },
  'assets/xstocks/platform.json': {
    identity: { slug: 'xstocks', name: 'xStocks', legacyPid: 12 },
    platform: { primaryChain: 'solana' },
  },
  'assets/xstocks/tslax.json': tslaxFile(),
  'perps/xyz/venue.json': {
    slug: 'xyz',
    organization: 'trade-xyz',
    venueType: 'dex',
    chain: 'hyperliquid',
    adapter: 'hyperliquid',
    published: true,
    accessModel: 'permissionless',
    rwaClassification: 'programmable-finance',
  },
  'perps/xyz/tsla.json': tslaMarketFile(),
});

// The registry sits in a folder of its own, so the acks beside it (../acks/) stay inside the test's folder.
export const writeTree = (tree: Tree): string => {
  const root = join(mkdtempSync(join(tmpdir(), 'rwa-registry-')), 'registry');
  for (const [path, content] of Object.entries(tree)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
};

// A TSLAx copy under another slug and legacy id, with no deployments or roles unless the fields give them.
export const assetFile = (slug: string, legacyId: number, fields: Record<string, unknown> = {}) =>
  tslaxWith({ slug, legacyId, canonicalMarketId: slug.toUpperCase(), deployments: [], roles: [], ...fields });

export const load = (tree: Tree, base: Registry | null = null) => loadRegistry(writeTree(tree), base);
export const registryOf = (tree: Tree) => load(tree).registry;
export const errorsIn = (problems: Problem[]) => problems.filter((problem) => problem.severity === 'error');
