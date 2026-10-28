/**
 * mapOrganizations: the Platforms rows and bare Parent Platform names as platforms, each row's Parent Platform as a slug, and one entity per rwaSlug of an Issuer item.
 * @dev review: src/import/mapAssets.ts
 */
import { rwaSlug } from '../registry';
import { modal } from '../utils/modal';
import type { ChainBook } from './chainBook';
import { BATCH, type Exports, type FileJson, type Unmapped } from './importTypes';
import type { SlugOf } from './mapVocabularies';
import { checkbox, isoDate, listOf, numberOf, sheetFlag, statedFalse, valueOf, type ExportRow } from './readExport';

export interface OrganizationContext {
  slugOf: SlugOf;
  chains: ChainBook;
}

type FeeKind = 'text' | 'number' | 'flag' | 'date' | 'confidence';

const FEES: [column: string, field: string, kind: FeeKind][] = [
  ['Revenue Model', 'revenueModel', 'text'],
  ['Holder Total Fee (bps)', 'holderTotalFeeBps', 'number'],
  ['Asset Manager Take (bps)', 'assetManagerTakeBps', 'number'],
  ['Tokenization Platform Take (bps)', 'tokenizationPlatformTakeBps', 'number'],
  ['Performance Fee (%)', 'performanceFeePct', 'number'],
  ['Yield Spread Retained (bps)', 'yieldSpreadRetainedBps', 'number'],
  ['Mint Fee (bps)', 'mintFeeBps', 'number'],
  ['Redemption Fee (bps)', 'redemptionFeeBps', 'number'],
  ['Underlying Fund Expense (bps)', 'underlyingFundExpenseBps', 'number'],
  ['Float Income', 'floatIncome', 'flag'],
  ['Platform Setup Fee (USD)', 'platformSetupFeeUsd', 'number'],
  ['Platform Recurring Service Fee (USD/yr)', 'platformRecurringServiceFeeUsdPerYr', 'number'],
  ['Prospectus URL', 'prospectusUrl', 'text'],
  ['Fee Schedule URL', 'feeScheduleUrl', 'text'],
  ['Issuer Docs URL', 'issuerDocsUrl', 'text'],
  ['T&Cs URL', 'tcsUrl', 'text'],
  ['Governance/Whitepaper URL', 'governanceWhitepaperUrl', 'text'],
  ['Revenue Confidence', 'revenueConfidence', 'confidence'],
  ['Fee Last Verified', 'feeLastVerified', 'date'],
  ['Fee Waiver End Date', 'feeWaiverEndDate', 'date'],
  ['Revenue Notes', 'revenueNotes', 'text'],
  ['Revenue Verification Method', 'revenueVerificationMethod', 'text'],
  ['Chain / Share-Class Fee Variants', 'chainShareClassFeeVariants', 'text'],
  ['Subsidy / Rebate Arrangements', 'subsidyRebateArrangements', 'text'],
  ['Take-Rate Basis', 'takeRateBasis', 'text'],
  ['Revenue Mix', 'revenueMix', 'text'],
];

const TEXT_FIELDS: [column: string, field: string][] = [
  ['Logo', 'logo'],
  ['Description/Notes', 'description'],
  ['Issuer Registry Info', 'registryInfo'],
  ['Attestation Frequency', 'attestationFrequency'],
  ['Headquarters', 'headquarters'],
  ['Founders / Leadership', 'founders'],
  ['Regulatory Status', 'regulatoryStatus'],
  ['Key Milestones', 'keyMilestones'],
  ['Entity Structure Notes', 'entityStructureNotes'],
];

export const compact = (object: Record<string, unknown>): FileJson =>
  Object.fromEntries(
    Object.entries(object).filter(([, value]) => value != null && !(Array.isArray(value) && value.length === 0)),
  );

export const linksOf = (row: ExportRow): FileJson | null => {
  const links = compact({
    website: listOf(row.Website),
    twitter: valueOf(row.Twitter),
    docs: valueOf(row.Docs),
    linkedin: valueOf(row.LinkedIn),
    discord: valueOf(row.Discord),
    telegram: valueOf(row.Telegram),
    github: valueOf(row['RWA Github']),
    refLinks: listOf(row['Ref Links']),
  });
  return Object.keys(links).length ? links : null;
};

const flagOf = (cell: string | undefined): boolean | null => {
  const value = (cell ?? '').toLowerCase();
  return value === 'yes' ? true : value === 'no' ? false : checkbox(cell);
};

const feesOf = (row: ExportRow, slugOf: SlugOf, id: string, unmapped: Unmapped[]): FileJson | null => {
  const fees: FileJson = {};
  const notes: string[] = [];
  for (const [column, field, kind] of FEES) {
    const cell = valueOf(row[column]);
    if (cell == null) continue;
    if (kind === 'text') fees[field] = cell;
    else if (kind === 'flag') fees[field] = flagOf(cell);
    else if (kind === 'confidence') fees[field] = slugOf('revenue-confidence', cell);
    else if (kind === 'date') {
      fees[field] = isoDate(cell);
      if (fees[field] == null) unmapped.push({ id, column, value: cell, reason: 'not an ISO date', batch: BATCH.call });
    } else {
      fees[field] = numberOf(cell);
      if (fees[field] == null) notes.push(`${column}: ${cell}`);
    }
  }
  if (notes.length) fees.revenueNotes = [fees.revenueNotes, ...notes].filter(Boolean).join('; ');
  return Object.keys(fees).length ? fees : null;
};

// A flag with no reason, or a reason with no flag and no CLEARED date, is a gap that onGap lists.
export const reviewEvent = (
  flag: string | undefined,
  reasonCell: string | undefined,
  onGap: (reason: string, value: string) => void = () => {},
): FileJson | null => {
  const reason = valueOf(reasonCell);
  if ((flag ?? '').toUpperCase() === 'TRUE') {
    if (!reason) onGap('flag with no reason', '');
    return compact({ kind: 'review', date: null, outcome: 'suspicious', reason });
  }
  const cleared = /^CLEARED\s+(\d{4}-\d{2}-\d{2})/.exec(reason ?? '');
  if (reason && !cleared) onGap('reason with no flag', reason);
  return cleared ? { kind: 'review', date: cleared[1], outcome: 'cleared', reason } : null;
};

export const delistingEvent = (): FileJson => ({
  kind: 'delisting',
  date: null,
  note: 'last stored day not given at import',
});

export const attestationEvent = (row: ExportRow): FileJson => {
  const cell = valueOf(row['Date of Last Attestation']);
  const date = isoDate(cell ?? undefined);
  return compact({
    kind: 'attestation',
    date,
    links: listOf(row['Attestation Links']),
    note: date == null ? (cell ?? 'no date in the export') : null,
  });
};

export const mapOrganizations = (exports: Exports, { slugOf, chains }: OrganizationContext) => {
  const organizations = new Map<string, FileJson>();
  const unmapped: Unmapped[] = [];
  const byName = new Map<string, string>();
  const chainSlug = (id: string, column: string, spelling: string): string | null => {
    const use = chains.use(spelling);
    if ('slug' in use) return use.slug;
    unmapped.push({
      id,
      column,
      value: spelling,
      reason: use.reason,
      batch: spelling === 'cex' ? BATCH.none : BATCH.call,
    });
    return null;
  };

  for (const row of exports.platforms) {
    const id = `PID ${row['*PID']}`;
    const slug = rwaSlug(row.Name);
    byName.set(row.Name, slug);
    const issuers = listOf(row.Issuer);
    const sourceLinks = listOf(row['Issuer Source Link'], /[;|]/);
    if (sourceLinks.length && !issuers.length)
      unmapped.push({
        id,
        column: 'Issuer Source Link',
        value: row['Issuer Source Link'],
        reason: 'a source link with no Issuer item to hold it',
        batch: BATCH.organizations,
      });
    organizations.set(slug, {
      ...compact({
        slug,
        name: row.Name,
        kind: 'platform',
        legacyPid: numberOf(row['*PID']),
        protocolSlug: valueOf(row['*defillamaSlug']),
        links: linksOf(row),
        category: listOf(row.Category).map((label) => slugOf('category', label)),
        platformType: listOf(row['Asset Class']).map((label) => slugOf('asset-class', label)),
        accessModel: slugOf('access-model', valueOf(row['Access Model'])),
        primaryChain: valueOf(row['Primary Chain']) && chainSlug(id, 'Primary Chain', row['Primary Chain']),
        chains: [...new Set(listOf(row.Chain).map((spelling) => chainSlug(id, 'Chain', spelling)))].filter(Boolean),
        foundedYear: numberOf(row['Founded Year']),
        marginSettlementAsset: valueOf(row['Margin / Settlement Asset']),
        suspicious: statedFalse(row.Suspicious),
        delisted: statedFalse(row.Delisted),
        llamaGradeAttestation: sheetFlag(row['Llama Grade Attestation']),
        fees: feesOf(row, slugOf, id, unmapped),
        ...Object.fromEntries(TEXT_FIELDS.map(([column, field]) => [field, valueOf(row[column])])),
      }),
      ...(issuers.length ? { roles: issuers.map((item) => ({ item, sourceLinks })) } : {}),
      events: [
        (row.Delisted ?? '').toUpperCase() === 'TRUE' ? delistingEvent() : null,
        reviewEvent(row.Suspicious, row['Suspicious reason?'], (reason, value) =>
          unmapped.push({ id, column: 'Suspicious reason?', value, reason, batch: BATCH.rows }),
        ),
        valueOf(row['Attestation Links']) || valueOf(row['Date of Last Attestation']) ? attestationEvent(row) : null,
      ].filter(Boolean),
    });
  }

  // Parent Platform lands as parentPlatform, the row's own slug when it names itself; parent holds only another platform.
  for (const row of exports.platforms) {
    const parent = valueOf(row['Parent Platform']);
    if (!parent) continue;
    const slug = byName.get(parent);
    const organization = organizations.get(byName.get(row.Name)!)!;
    if (slug) {
      organization.parentPlatform = slug;
      if (parent !== row.Name) organization.parent = slug;
    } else
      unmapped.push({
        id: `PID ${row['*PID']}`,
        column: 'Parent Platform',
        value: parent,
        reason: 'names no Platforms row',
        batch: BATCH.organizations,
      });
  }

  const missing = new Set(
    exports.markets.flatMap((row) => listOf(row['Parent Platform'])).filter((name) => !byName.has(name)),
  );
  for (const name of [...missing].sort()) {
    byName.set(name, rwaSlug(name));
    organizations.set(rwaSlug(name), { slug: rwaSlug(name), name, kind: 'platform' });
  }

  const items = [...exports.markets, ...exports.platforms].flatMap((row) => listOf(row.Issuer));
  const spellings = new Map<string, string[]>();
  for (const item of items.filter((item) => !byName.has(item))) {
    spellings.set(rwaSlug(item), [...(spellings.get(rwaSlug(item)) ?? []), item]);
  }
  for (const [slug, names] of [...spellings].sort(([a], [b]) => a.localeCompare(b))) {
    if (!organizations.has(slug)) organizations.set(slug, { slug, name: modal(names), kind: 'entity' });
  }
  const issuerOf = (item: string): string => byName.get(item) ?? rwaSlug(item);
  for (const organization of organizations.values()) {
    if (Array.isArray(organization.roles)) {
      const items = organization.roles as { item: string; sourceLinks: string[] }[];
      organization.roles = [...new Map(items.map((role) => [role.item, role])).values()].map(({ item, sourceLinks }) =>
        compact({ organization: issuerOf(item), kind: 'issuer', sourceLinks }),
      );
    }
    if (Array.isArray(organization.events) && organization.events.length === 0) delete organization.events;
  }

  return {
    organizations,
    unmapped,
    issuerOf,
    platformOf: (name: string | null): string | null => (name == null ? null : (byName.get(name) ?? null)),
  };
};
