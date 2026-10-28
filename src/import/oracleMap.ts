/**
 * oracleMap: the oracle rows of the patches, firms written as organizations and Oracle Provider cells turned into roles.
 * @dev review: src/import/importExports.ts
 */
import type { PatchRow } from './applyPatch';
import { BATCH, RWA_ID, type Exports, type FileJson, type RegistryFiles, type Unmapped } from './importTypes';
import { compact } from './mapOrganizations';
import { listOf, valueOf, type ExportRow } from './readExport';

type Entry = { kind: string | null; organization: string | null } | 'unknown';
type Role = { organization: string; kind: string };

export interface OracleMap {
  firms: FileJson[];
  cells: Map<string, Entry[]>;
}

const FIRM = 'export:oracle-firm';
const MAP = 'export:oracle-map';
const ISSUER = '@issuer';
const COLUMN = 'Oracle Provider';
const PROOF = 'Oracle Proof Link';
const ASSET_FILE = /^assets\/([^/]+)\/(?!platform\.json$)[^/]+\.json$/;
const ORGANIZATION_FILE = /^(?:assets\/([^/]+)\/platform|reference\/organizations\/([^/]+))\.json$/;
const VENUE_FILE = /^perps\/[^/]+\/venue\.json$/;
const ROLE_KINDS = 'reference/vocabularies/role-kind.json';
const isLink = (item: string) => /^https?:\/\/\S+$/.test(item);

// A row of the oracle map or an oracle firm, the batch rows that name no export row.
export const isOracleRow = (row: { file: string }) => row.file === MAP || row.file === FIRM;

export const readOracleMap = (rows: PatchRow[]): OracleMap => {
  const cells = new Map<string, Entry[]>();
  for (const row of rows.filter((row) => row.file === MAP)) {
    const entry: Entry = row.new === 'unknown' ? 'unknown' : JSON.parse(row.new);
    cells.set(row.old, [...(cells.get(row.old) ?? []), entry]);
  }
  return { firms: rows.filter((row) => row.file === FIRM).map((row) => JSON.parse(row.new)), cells };
};

export const applyOracleMap = (
  files: RegistryFiles,
  exports: Exports,
  map: OracleMap,
): { files: RegistryFiles; unmapped: Unmapped[]; firms: number } => {
  const out: RegistryFiles = new Map(files);
  const unmapped: Unmapped[] = [];
  const organizations = new Set(
    [...files.keys()].flatMap((path) => {
      const match = ORGANIZATION_FILE.exec(path);
      return match ? [match[1] ?? match[2]] : [];
    }),
  );
  let firms = 0;
  for (const firm of map.firms) {
    if (organizations.has(String(firm.slug))) continue;
    const { slug, name, kind, website } = firm;
    const links = website ? { website: [website].flat() } : null;
    out.set(`reference/organizations/${slug}.json`, compact({ slug, name, kind, links }));
    organizations.add(String(slug));
    firms += 1;
  }
  const markets = new Map(exports.markets.map((row) => [row[RWA_ID], row]));
  const platforms = new Map(exports.platforms.map((row) => [row['*PID'], row]));

  const rolesOf = (id: string, cell: string, self: string, file: FileJson, listMissing: boolean): Role[] => {
    const list = (reason: string) =>
      unmapped.push({ id, column: COLUMN, value: cell, reason, batch: BATCH.organizations });
    const entries = map.cells.get(cell);
    if (!entries) {
      if (listMissing) list('oracle cells wait for the oracle map');
      return [];
    }
    const issuer = ((file.roles as Role[] | undefined) ?? []).find((role) => role.kind === 'issuer')?.organization;
    const roles: Role[] = [];
    for (const entry of entries) {
      if (entry === 'unknown') list('oracle map: unknown');
      else if (entry.kind == null && entry.organization != null)
        list(`oracle map: role of ${entry.organization} has no kind`);
      else if (entry.kind != null && entry.organization == null)
        list(`oracle map: ${entry.kind} names no organization`);
      else if (entry.kind != null && entry.organization != null) {
        const organization = entry.organization === ISSUER ? (issuer ?? self) : entry.organization;
        if (organizations.has(organization)) roles.push({ organization, kind: entry.kind });
        else list(`oracle map: no organization ${organization}`);
      }
    }
    return roles;
  };

  const written = new Set<string>();
  for (const [path, file] of files) {
    if (Array.isArray(file)) continue;
    const asset = ASSET_FILE.exec(path);
    const organization = ORGANIZATION_FILE.exec(path);
    const row: ExportRow | undefined = asset
      ? markets.get(String(file.legacyId))
      : organization && file.legacyPid != null
        ? platforms.get(String(file.legacyPid))
        : undefined;
    // A venue keeps its oracleProvider text and gets the cell's roles, since no role targets a market.
    const cell = row ? valueOf(row[COLUMN]) : VENUE_FILE.test(path) ? ((file.oracleProvider as string) ?? null) : null;
    if (!cell) continue;
    const id = asset ? String(file.legacyId) : row ? `PID ${row['*PID']}` : String(file.slug);
    const self = asset?.[1] ?? organization?.[1] ?? organization?.[2] ?? String(file.organization ?? '');
    const existing = (file.roles as Role[] | undefined) ?? [];
    const seen = new Set(existing.map((role) => `${role.organization}|${role.kind}`));
    const added = rolesOf(id, cell, self, file, row != null).filter((role) => {
      const key = `${role.organization}|${role.kind}`;
      return seen.has(key) ? false : (seen.add(key), true);
    });
    // A Platforms row's Oracle Proof Link goes on each oracle role its cell names, as an issuer link does; an asset's
    // too, its links only, since most asset cells repeat the provider's name, which the role already carries.
    const proof = !row ? [] : organization ? listOf(row[PROOF], /[;|]/) : listOf(row[PROOF], /[;|\s]+/).filter(isLink);
    if (proof.length && !added.length)
      unmapped.push({
        id,
        column: PROOF,
        value: row![PROOF],
        reason: 'a proof link with no oracle role',
        batch: BATCH.organizations,
      });
    const linked = added.map((role) => (proof.length ? { ...role, sourceLinks: proof } : role));
    if (linked.length) out.set(path, { ...file, roles: [...existing, ...linked] });
    added.forEach((role) => written.add(role.kind));
  }
  const kinds = (files.get(ROLE_KINDS) as FileJson[] | undefined) ?? [];
  const missing = [...written].filter((kind) => !kinds.some((row) => row.slug === kind));
  if (missing.length)
    out.set(
      ROLE_KINDS,
      [...kinds, ...missing.map((slug) => ({ slug, label: slug }))].sort((a, b) =>
        String(a.slug).localeCompare(String(b.slug)),
      ),
    );
  return { files: out, unmapped, firms };
};
