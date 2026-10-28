/**
 * applyCodeLists: the server code lists written into the registry files: chain labels, caip2, sdk keys and burn addresses, holder label kinds, flags, currencies and acks.
 * @dev review: src/import/codeLists.ts
 */
import { BURN_ADDRESSES, homeFile } from '../registry';
import type { AddressFamily } from '../schema';
import {
  CHAIN_CAIP2,
  CHAIN_LABELS,
  CODE_ACKS,
  CRYPTO_TICKERS,
  ESTIMATE_REVENUE_LABELS,
  FOREX_CODES,
  GOVERNANCE_LABELS,
  ONCHAIN_MCAP_EQUALS_ACTIVE_PLATFORMS,
  RESERVE_UNRELEASED_BY_CG,
  STABLECOIN_LABELS,
} from './codeLists';
import type { FileJson, RegistryFiles } from './importTypes';
import { sdkKeyOf } from './sdkChains';

export type CodeListCounts = Record<string, number>;

const ASSET_FILE = /^assets\/[^/]+\/(?!platform\.json$)[^/]+\.json$/;

const filesUnder = (files: RegistryFiles, pattern: RegExp) =>
  [...files].filter(([path]) => pattern.test(path)) as [string, FileJson][];

const count = (counts: CodeListCounts, field: string, n = 1) => {
  counts[field] = (counts[field] ?? 0) + n;
};

const chains = (files: RegistryFiles, counts: CodeListCounts) => {
  for (const [path, chain] of filesUnder(files, /^reference\/chains\//)) {
    const slug = String(chain.slug);
    const burn = BURN_ADDRESSES[chain.addressFamily as AddressFamily] ?? null;
    const next = { ...chain };
    if (CHAIN_LABELS[slug]) {
      next.label = CHAIN_LABELS[slug];
      count(counts, 'chain.label');
    }
    if (CHAIN_CAIP2[slug]) {
      next.caip2 = CHAIN_CAIP2[slug];
      count(counts, 'chain.caip2');
    }
    if (burn) {
      next.burnAddresses = burn;
      count(counts, 'chain.burnAddresses');
    }
    const sdkKey = sdkKeyOf({ slug, aliases: chain.aliases as string[] | undefined });
    if (sdkKey) {
      next.sdkKey = sdkKey;
      count(counts, 'chain.sdkKey');
    } else delete next.sdkKey;
    files.set(path, next);
  }
};

// A holder the server lists as an unreleased issuer reserve keeps that kind; every other holder stays excluded.
const addressLabels = (files: RegistryFiles, counts: CodeListCounts) => {
  for (const [path, asset] of filesUnder(files, ASSET_FILE)) {
    const reserves = RESERVE_UNRELEASED_BY_CG[String(asset.coingeckoId ?? '')];
    if (!reserves || !Array.isArray(asset.deployments)) continue;
    const deployments = (asset.deployments as FileJson[]).map((deployment) => {
      const own = new Set(reserves[String(deployment.chain)] ?? []);
      if (!own.size || !Array.isArray(deployment.labels)) return deployment;
      const labels = (deployment.labels as FileJson[]).map((label) => {
        if (!own.has(String(label.address).toLowerCase())) return label;
        count(counts, 'address_label.kind reserve-unreleased');
        return { ...label, kind: 'reserve-unreleased' };
      });
      return { ...deployment, labels };
    });
    files.set(path, { ...asset, deployments });
  }
};

const FLAGS: { flag: string; labels: Partial<Record<string, string[]>>; word?: string }[] = [
  { flag: 'impliesStablecoin', labels: STABLECOIN_LABELS, word: 'stablecoin' },
  { flag: 'impliesGovernance', labels: GOVERNANCE_LABELS, word: 'governance' },
  { flag: 'estimateRevenue', labels: { 'revenue-confidence': ESTIMATE_REVENUE_LABELS } },
];

// The server matches the published label with its whitespace collapsed; a category also matches by word.
const flagged = (vocabulary: string, label: string, { labels, word }: (typeof FLAGS)[number]) => {
  const clean = label.replace(/\s+/g, ' ').trim();
  return (
    (labels[vocabulary] ?? []).includes(clean) ||
    (vocabulary === 'category' && word !== undefined && clean.toLowerCase().includes(word))
  );
};

const vocabularies = (files: RegistryFiles, counts: CodeListCounts) => {
  for (const [path, values] of [...files].filter(([path]) => path.startsWith('reference/vocabularies/'))) {
    const vocabulary = path.slice('reference/vocabularies/'.length, -'.json'.length);
    const rows = (values as FileJson[]).map((value) => {
      const next = { ...value };
      for (const rule of FLAGS.filter((rule) => flagged(vocabulary, String(value.label), rule))) {
        next[rule.flag] = true;
        count(counts, `vocabulary.${rule.flag}`);
      }
      return next;
    });
    if (vocabulary === 'currency') {
      const known = new Set(rows.map((row) => row.slug));
      const added = FOREX_CODES.filter((code) => !known.has(code.toLowerCase()));
      rows.push(...added.map((code) => ({ slug: code.toLowerCase(), label: code })));
      rows.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
      count(counts, 'vocabulary.currency (FOREX_CODES)', FOREX_CODES.length);
    }
    files.set(path, rows);
  }
};

const CRYPTO_REASON = 'crypto ticker (CRYPTO_TICKERS)';

const underlyings = (files: RegistryFiles, counts: CodeListCounts) => {
  const crypto = new Set(CRYPTO_TICKERS);
  for (const [path, underlying] of filesUnder(files, /^reference\/underlyings\//)) {
    // Only on a crypto exposure: 18 other underlyings share a ticker with the list (DASH, STX, WEN, SUI).
    if (underlying.class !== 'crypto' || !crypto.has(String(underlying.ticker ?? '').toUpperCase())) continue;
    files.set(path, { ...underlying, excludedReason: underlying.excludedReason ?? CRYPTO_REASON });
    count(counts, 'underlying.excludedReason');
  }
};

const organizations = (files: RegistryFiles, counts: CodeListCounts) => {
  const names = new Set(ONCHAIN_MCAP_EQUALS_ACTIVE_PLATFORMS.map((name) => name.trim().toLowerCase()));
  const homes = /^(assets\/[^/]+\/platform\.json|reference\/organizations\/[^/]+\.json)$/;
  for (const [path, organization] of filesUnder(files, homes)) {
    if (organization.kind !== 'platform' || !names.has(String(organization.name).trim().toLowerCase())) continue;
    files.set(path, { ...organization, onchainMcapBasis: 'active' });
    count(counts, 'organization.onchainMcapBasis');
  }
};

const acks = (files: RegistryFiles, counts: CodeListCounts) => {
  const slugOf = new Map(filesUnder(files, ASSET_FILE).map(([, asset]) => [asset.legacyId, String(asset.slug)]));
  for (const { legacyId, slugSuffix, ...ack } of CODE_ACKS) {
    const asset = slugOf.get(legacyId);
    if (!asset) {
      count(counts, 'ack: asset not in the registry');
      continue;
    }
    const slug = `${asset}-${slugSuffix}`;
    files.set(homeFile('ack', { slug }), {
      slug,
      guard: ack.guard,
      asset,
      from: ack.from,
      reason: ack.reason,
      resolve: ack.resolve,
    });
    count(counts, 'ack');
  }
};

export const applyCodeLists = (input: RegistryFiles): { files: RegistryFiles; counts: CodeListCounts } => {
  const files: RegistryFiles = new Map(input);
  const counts: CodeListCounts = {};
  for (const pass of [chains, addressLabels, vocabularies, underlyings, organizations, acks]) pass(files, counts);
  return { files, counts };
};
