/**
 * layout: which table a file under registry/ holds, the field its folder or file name supplies, and the file of each row.
 * @dev review: src/registry/loadRegistry.ts
 */
import { ARRAY_TABLES, type TableName } from '../schema/enums';

export const REGISTRY_DIR = 'registry';
// The acks sit beside registry/ at the repository root, so a path names them from the registry folder.
export const ACKS_DIR = '../acks';

type FileRow = Record<string, unknown>;
export type FileTable = Exclude<TableName, 'deployment' | 'role' | 'event' | 'address_label'>;

interface Home {
  pattern: RegExp;
  table: FileTable;
  implied?: (match: RegExpExecArray) => string;
  file: (row: FileRow) => string;
}

export const platformFile = (platform: string) => `assets/${platform}/platform.json`;
export const venueOperatorFile = (venue: string) => `perps/${venue}/organization.json`;

// An organization's file by its kind; a venue operator sits beside the venue that names it, given as venue.
const organizationFile = (row: FileRow): string =>
  row.kind === 'platform'
    ? platformFile(String(row.slug))
    : row.kind === 'venue-operator'
      ? venueOperatorFile(String(row.venue))
      : `reference/organizations/${row.kind}/${row.slug}.json`;

// The order is the match order: platform.json before an asset file, venue.json and organization.json before a market file.
const LAYOUT: Home[] = [
  {
    pattern: /^reference\/vocabularies\/([^/]+)\.json$/,
    table: 'vocabulary',
    implied: (match) => match[1],
    file: (row) => `reference/vocabularies/${row.vocabulary}.json`,
  },
  {
    pattern: /^reference\/organizations\/([^/]+)\/[^/]+\.json$/,
    table: 'organization',
    implied: (match) => match[1],
    file: organizationFile,
  },
  {
    pattern: /^reference\/underlyings\/([^/]+)\/[^/]+\.json$/,
    table: 'underlying',
    implied: (match) => match[1],
    file: (row) => `reference/underlyings/${row.class}/${row.slug}.json`,
  },
  { pattern: /^assets\/[^/]+\/platform\.json$/, table: 'organization', implied: () => 'platform', file: organizationFile },
  {
    pattern: /^assets\/([^/]+)\/[^/]+\.json$/,
    table: 'asset',
    implied: (match) => match[1],
    file: (row) => `assets/${row.platform}/${row.slug}.json`,
  },
  { pattern: /^perps\/[^/]+\/venue\.json$/, table: 'venue', file: (row) => `perps/${row.slug}/venue.json` },
  {
    pattern: /^perps\/[^/]+\/organization\.json$/,
    table: 'organization',
    implied: () => 'venue-operator',
    file: organizationFile,
  },
  {
    pattern: /^perps\/([^/]+)\/[^/]+\.json$/,
    table: 'perp_market',
    implied: (match) => match[1],
    file: (row) => `perps/${row.venue}/${String(row.symbol).toLowerCase()}.json`,
  },
  {
    pattern: /^\.\.\/acks\/([^/]+)\/[^/]+\.json$/,
    table: 'ack',
    implied: (match) => match[1],
    file: (row) => `${ACKS_DIR}/${row.kind}/${row.slug}.json`,
  },
];

export const homeOf = (file: string): { table: TableName; implied: string | null; many: boolean } | null => {
  for (const home of LAYOUT) {
    const match = home.pattern.exec(file);
    if (match) return { table: home.table, implied: home.implied ? home.implied(match) : null, many: ARRAY_TABLES.includes(home.table) };
  }
  return null;
};

// The file a row of the table sits in; an organization's depends on its kind.
export const homeFile = (table: FileTable, row: FileRow): string =>
  table === 'organization' ? organizationFile(row) : LAYOUT.find((home) => home.table === table)!.file(row);

export const FILE_TABLES = [...new Set(LAYOUT.map((home) => home.table))];

export const marketFile = (market: { venue: string; symbol: string }) => homeFile('perp_market', market);
