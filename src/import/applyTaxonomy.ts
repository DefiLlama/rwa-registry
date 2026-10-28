/**
 * applyTaxonomy: the last taxonomy step of the import. The rows' asset group moves onto their underlying as its exposure, an asset keeps one structure, and its category comes from one rule per structure and exposure; an asset whose published flag the rule would change keeps it as an override; every row this changes is a call.
 * @dev review: src/registry/deriveFields.ts
 */
import { CATEGORY_RULES_FILE, homeOf } from '../registry/layout';
import { groupBy } from '../utils/groupBy';
import { modal } from '../utils/modal';
import { isStagedUnderlying, stagedUnderlying } from './applyFolds';
import { flagOverrides, vocabularyRows } from './flagOverrides';
import type { Call, FileJson, RegistryFiles } from './importTypes';

type Vote = { value: string; id: string };

const TOPIC = 'taxonomy';
const rows = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`;
const ids = (votes: Vote[]) => votes.map((vote) => vote.id).join(', ');
const filesOf = (files: RegistryFiles, table: string) =>
  [...files].filter(([path]) => homeOf(path)?.table === table) as [string, FileJson][];

// One underlying's exposure: the group most of its rows carry; the others are listed with their rows.
const exposures = (files: RegistryFiles, calls: Call[]): Map<string, string> => {
  const assets = filesOf(files, 'asset');
  const underlyingOf = new Map(assets.map(([, asset]) => [String(asset.slug), String(asset.underlying)]));
  const votes: [string | undefined, Vote | null][] = [
    ...assets.map(([, asset]): [string, Vote | null] => [
      String(asset.underlying),
      asset.assetGroup ? { value: String(asset.assetGroup), id: String(asset.legacyId) } : null,
    ]),
    ...filesOf(files, 'perp_market').map(([, market]): [string | undefined, Vote | null] => [
      market.tracks ? String(market.tracks) : underlyingOf.get(String(market.tracksAsset)),
      market.assetGroup
        ? { value: String(market.assetGroup), id: String(market.legacyId ?? `${market.venue}:${market.symbol}`) }
        : null,
    ]),
  ];
  const byUnderlying = groupBy(
    votes.filter((vote): vote is [string, Vote] => vote[0] !== undefined && vote[1] !== null),
    ([slug]) => slug,
  );
  const exposure = new Map<string, string>();
  for (const [slug, own] of [...byUnderlying].sort(([a], [b]) => a.localeCompare(b))) {
    const keep = modal(own.map(([, vote]) => vote.value))!;
    exposure.set(slug, keep);
    const others = [
      ...groupBy(
        own.map(([, vote]) => vote).filter((vote) => vote.value !== keep),
        (vote) => vote.value,
      ),
    ];
    if (!others.length) continue;
    const kept = own.length - others.reduce((sum, [, lost]) => sum + lost.length, 0);
    const lost = others.map(([value, lost]) => `${value} on ${rows(lost.length)}: ${ids(lost)}`).join('; ');
    calls.push({ topic: TOPIC, line: `${slug} keeps exposure ${keep} (${rows(kept)}); ${lost}` });
  }
  return exposure;
};

// The rule a decided file holds wins; a structure and exposure it lacks take the category cell most of their rows carry.
const categoryRules = (
  assets: { structure: string; exposure: string; category: string; id: string }[],
  decided: FileJson[],
  calls: Call[],
): FileJson[] => {
  const key = (row: Record<string, unknown>) => `${row.structure}:${row.exposure}`;
  const rules = new Map(decided.map((rule) => [key(rule), (rule.category as string[]).join(', ')]));
  const byPair = groupBy(assets, key);
  for (const [pair, own] of byPair) if (!rules.has(pair)) rules.set(pair, modal(own.map((row) => row.category))!);
  const differ = assets.filter((row) => row.category !== rules.get(key(row)));
  const byShelf = [...groupBy(differ, (row) => rules.get(key(row))!.split(', ')[0])].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  calls.push({
    topic: TOPIC,
    line: `Category: ${differ.length} of ${rows(assets.length)} differ from the rule of their structure and exposure; by the rule's first category: ${byShelf.map(([shelf, own]) => `${shelf} ${own.length}`).join(', ') || 'none'}.`,
  });
  const groups = groupBy(differ, (row) => `${key(row)}|${row.category}`);
  for (const own of [...groups.values()].sort((a, b) => b.length - a.length || key(a[0]).localeCompare(key(b[0])))) {
    const [{ structure, exposure, category }] = own;
    const line = `${rows(own.length)} of ${structure} on ${exposure}: the sheet says ${category}, the rule ${rules.get(key(own[0]))}: ${ids(own.map((row) => ({ value: '', id: row.id })))}`;
    calls.push({ topic: TOPIC, line });
  }
  return [...rules]
    .map(([pair, category]) => {
      const [structure, exposure] = pair.split(':');
      return { structure, exposure, category: category.split(', ') };
    })
    .sort((a, b) => a.structure.localeCompare(b.structure) || a.exposure.localeCompare(b.exposure));
};

// An asset written with several asset classes keeps the first as its structure; the rows are listed by their classes.
const structures = (assets: [string, FileJson][], calls: Call[]) => {
  const several = assets.filter(([, asset]) => (asset.assetClass as string[]).length > 1);
  if (!several.length) return;
  calls.push({
    topic: TOPIC,
    line: `Structure: ${rows(several.length)} carry more than one asset class; each keeps the first, so its published assetClass drops the rest.`,
  });
  const byClasses = groupBy(several, ([, asset]) => (asset.assetClass as string[]).join(', '));
  for (const [classes, own] of [...byClasses].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    calls.push({
      topic: TOPIC,
      line: `${rows(own.length)} of ${classes}: ${own.map(([, asset]) => asset.legacyId).join(', ')}`,
    });
  }
};

export const applyTaxonomy = (
  staged: RegistryFiles,
  decided: FileJson[],
): { files: RegistryFiles; calls: Call[]; rules: number } => {
  const files: RegistryFiles = new Map(staged);
  const calls: Call[] = [];
  const exposure = exposures(files, calls);
  for (const [path, underlying] of [...files].filter(([path]) => isStagedUnderlying(path)) as [string, FileJson][]) {
    const own = exposure.get(String(underlying.slug)) ?? underlying.exposure;
    files.set(path, { ...underlying, exposure: own });
  }
  const assets = filesOf(files, 'asset');
  structures(assets, calls);
  const exposureOf = (slug: unknown) =>
    (files.get(stagedUnderlying(String(slug))) as FileJson | undefined)?.exposure ?? exposure.get(String(slug));
  const rules = categoryRules(
    assets.map(([, asset]) => ({
      structure: (asset.assetClass as string[])[0],
      exposure: String(exposureOf(asset.underlying)),
      category: (asset.category as string[]).join(', '),
      id: String(asset.legacyId),
    })),
    decided,
    calls,
  );
  const ruleOf = new Map(rules.map((rule) => [`${rule.structure}:${rule.exposure}`, rule.category as string[]]));
  const flags = flagOverrides(
    assets,
    (asset) => ruleOf.get(`${(asset.assetClass as string[])[0]}:${exposureOf(asset.underlying)}`) ?? [],
    vocabularyRows(files),
  );
  calls.push(...flags.calls);
  for (const [path, { assetClass, assetGroup: _, category: __, ...asset }] of assets) {
    files.set(path, { ...asset, structure: (assetClass as string[])[0], ...flags.overrides.get(path) });
  }
  for (const [path, { assetClass, assetGroup: _, ...market }] of filesOf(files, 'perp_market')) {
    files.set(path, { ...market, structure: assetClass });
  }
  files.set(CATEGORY_RULES_FILE, rules);
  return { files, calls, rules: rules.length };
};
