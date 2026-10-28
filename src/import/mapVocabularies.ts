/**
 * mapVocabularies: every value of the vocabulary columns as a row slugged by rwaSlug of its most used spelling, the others as aliases.
 * @dev review: src/import/importExports.ts
 */
import { rwaSlug } from '../registry';
import type { VocabularyName } from '../schema';
import type { Exports, FileJson, RegistryFiles } from './importTypes';
import { listOf, valueOf, type ExportRow } from './readExport';
import { modal } from '../utils/modal';
import { ORGANIZATION_KINDS } from './homeOrganizations';

type Source = { tab: keyof Exports; column: string; list: boolean };

export const VOCABULARY_COLUMNS: Partial<Record<VocabularyName, Source[]>> = {
  category: [
    { tab: 'markets', column: 'Category', list: true },
    { tab: 'platforms', column: 'Category', list: true },
  ],
  'asset-class': [
    { tab: 'markets', column: 'Asset Class', list: true },
    { tab: 'platforms', column: 'Asset Class', list: true },
  ],
  'asset-group': [{ tab: 'markets', column: 'Asset Group', list: false }],
  'access-model': [
    { tab: 'markets', column: 'Access Model', list: false },
    { tab: 'platforms', column: 'Access Model', list: false },
  ],
  'rwa-classification': [{ tab: 'markets', column: 'RWA Classification', list: false }],
  type: [{ tab: 'markets', column: 'Type', list: false }],
  'revenue-confidence': [{ tab: 'platforms', column: 'Revenue Confidence', list: false }],
};

// The values the import itself writes: role and event kinds, the holder label, venue types, underlying classes and organization kinds.
const IMPORT_VALUES: Partial<Record<VocabularyName, string[]>> = {
  'role-kind': ['issuer'],
  'event-kind': ['listing', 'delisting', 'retirement', 'attestation', 'review'],
  'label-kind': ['excluded-holder'],
  'venue-type': ['dex', 'cex'],
  'underlying-class': ['equity', 'commodity', 'fx', 'crypto', 'fund', 'rate', 'other'],
  'organization-kind': ORGANIZATION_KINDS,
};

export type ExistingVocabularies = Partial<Record<VocabularyName, FileJson[]>>;
export type SlugOf = (vocabulary: VocabularyName, label: string | null) => string | null;

const spellings = (rows: ExportRow[], { column, list }: Source): string[] =>
  rows.flatMap((row) => (list ? listOf(row[column]) : [valueOf(row[column])].filter((value) => value != null)));

const rowsOf = (seen: string[], existing: FileJson[], fixed: string[]): FileJson[] => {
  const bySlug = new Map<string, FileJson>(existing.map((row) => [String(row.slug), { ...row }]));
  for (const slug of fixed) if (!bySlug.has(slug)) bySlug.set(slug, { slug, label: slug });
  const spelled = new Map<string, string[]>();
  for (const label of seen) spelled.set(rwaSlug(label), [...(spelled.get(rwaSlug(label)) ?? []), label]);
  for (const [slug, labels] of spelled) {
    const row = bySlug.get(slug) ?? { slug };
    const label = modal(labels)!;
    const aliases = new Set([...((row.aliases as string[] | undefined) ?? []), ...labels, String(row.label ?? label)]);
    aliases.delete(label);
    bySlug.set(slug, { ...row, slug, label, ...(aliases.size ? { aliases: [...aliases].sort() } : {}) });
  }
  return [...bySlug.values()].sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
};

export const mapVocabularies = (
  exports: Exports,
  existing: ExistingVocabularies,
  currencies: string[],
): { files: RegistryFiles; slugOf: SlugOf; values: Record<string, number> } => {
  const files: RegistryFiles = new Map();
  const values: Record<string, number> = {};
  const lookup = new Map<string, string>();
  const columns = { ...VOCABULARY_COLUMNS } as Record<string, Source[]>;
  const names = new Set([
    ...Object.keys(existing),
    ...Object.keys(columns),
    ...Object.keys(IMPORT_VALUES),
    'currency',
  ]) as Set<VocabularyName>;
  for (const name of names) {
    const seen =
      name === 'currency'
        ? currencies
        : (columns[name] ?? []).flatMap((source) => spellings(exports[source.tab], source));
    const rows = rowsOf(seen, existing[name] ?? [], IMPORT_VALUES[name] ?? []);
    files.set(`reference/vocabularies/${name}.json`, rows);
    values[name] = new Set(seen.map(rwaSlug)).size;
    for (const label of seen) lookup.set(`${name}|${label}`, rwaSlug(label));
  }
  const slugOf: SlugOf = (vocabulary, label) => (label == null ? null : (lookup.get(`${vocabulary}|${label}`) ?? null));
  return { files, slugOf, values };
};
