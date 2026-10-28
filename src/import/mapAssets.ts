/**
 * mapAssets: every spot row as one asset file with its deployments, holder labels, issuer roles and events, or held when a required value is missing.
 * @dev review: src/import/rowFate.ts
 */
import { rowSlug } from '../registry';
import { groupBy } from '../utils/groupBy';
import type { ImportContext } from './importContext';
import { BATCH, MARKET_ID, RWA_ID, type Exports, type FileJson, type Unmapped } from './importTypes';
import { isinCodes, sheetIsin } from './isin';
import { attestationEvent, compact, delistingEvent, linksOf, reviewEvent } from './mapOrganizations';
import { chainOf, normalizeAddress, normalizeHolder } from './normalizeAddress';
import { checkbox, listOf, sheetFlag, statedFalse, valueOf, type ExportRow } from './readExport';
import { FATE_REASON, rowFate } from './rowFate';

const HOLDERS = '*Holders to be Removed for Active Marketcap';
// The server's RWA_RETIRED_ZERO_IDS.
const RETIRED = new Set([386, 198, 431]);
// The server's PEG_TYPE_TO_ISO_CURRENCY, peggedREAL on BRZ.
const CURRENCY_OF_SYMBOL: Record<string, string> = { BRZ: 'brl' };
const FLAGS: [column: string, field: string][] = [
  ['Redeemable', 'redeemable'],
  ['CEX Listed', 'cexListed'],
  ['KYC for mint/redeem', 'kycForMintRedeem'],
  ['KYC/Allowlisted/Whitelisted to Transfer/Hold', 'kycToTransferHold'],
  ['Transferable', 'transferable'],
  ['Self Custody', 'selfCustody'],
  ['Yield Bearing', 'yieldBearing'],
];

type Gap = { column: string; field: string; batch: string };

const isTrue = (cell: string | undefined) => (cell ?? '').toUpperCase() === 'TRUE';
const idOf = (row: ExportRow) => Number(row[RWA_ID]);

const assetSlugs = (rows: ExportRow[]): Map<ExportRow, string> => {
  const base = (row: ExportRow) => rowSlug(valueOf(row[MARKET_ID]) ?? row.Ticker ?? '');
  const slugs = new Map<ExportRow, string>();
  const taken = new Set<string>();
  for (const row of [...rows].sort((a, b) => idOf(a) - idOf(b))) {
    const slug = taken.has(base(row)) ? `${base(row)}-${row[RWA_ID]}` : base(row);
    slugs.set(row, slug);
    taken.add(slug);
  }
  return slugs;
};

const gapsOf = (row: ExportRow, context: ImportContext): Gap[] => {
  const { slugOf, organizations, underlyings } = context;
  const checks: [boolean, Gap][] = [
    [
      !organizations.platformOf(listOf(row['Parent Platform'])[0] ?? null),
      { column: 'Parent Platform', field: 'platform', batch: BATCH.organizations },
    ],
    [
      !underlyings.slugOf(valueOf(row['Reference Asset'])),
      { column: 'Reference Asset', field: 'underlying', batch: BATCH.underlyings },
    ],
    [!slugOf('type', valueOf(row.Type)), { column: 'Type', field: 'type', batch: BATCH.rows }],
    [
      !slugOf('asset-group', valueOf(row['Asset Group'])),
      { column: 'Asset Group', field: 'assetGroup', batch: BATCH.rows },
    ],
    [
      !slugOf('rwa-classification', valueOf(row['RWA Classification'])),
      { column: 'RWA Classification', field: 'rwaClassification', batch: BATCH.rows },
    ],
    [!valueOf(row.Name), { column: 'Name', field: 'name', batch: BATCH.rows }],
    [!valueOf(row.Ticker) && !valueOf(row[MARKET_ID]), { column: 'Ticker', field: 'symbol', batch: BATCH.rows }],
    [!valueOf(row[MARKET_ID]), { column: MARKET_ID, field: 'canonicalMarketId', batch: BATCH.call }],
    [
      !valueOf(row['Primary Chain']) || 'reason' in context.chains.use(row['Primary Chain']),
      { column: 'Primary Chain', field: 'primaryChain', batch: BATCH.call },
    ],
  ];
  return checks.filter(([missing]) => missing).map(([, gap]) => gap);
};

const deploymentsOf = (row: ExportRow, context: ImportContext, unmapped: Unmapped[]): FileJson[] => {
  const deployments = new Map<string, FileJson>();
  if (valueOf(row.Contracts) == null) return [];
  for (const item of row.Contracts.split(';').map((part) => part.trim())) {
    const key = normalizeAddress(item);
    if ('reason' in key) {
      unmapped.push({ id: row[RWA_ID], column: 'Contracts', value: item, reason: key.reason, batch: BATCH.call });
      continue;
    }
    context.chains.record(key.chain, key.family, item.slice(0, item.indexOf(':')));
    deployments.set(`${key.chain}:${key.address}`, { chain: key.chain, address: key.address, deployedAt: null });
  }
  return [...deployments.values()];
};

export const NO_CONTRACT = 'chain listed with no contract on it';

// A Chain item with no deployment on that chain: a deployment needs an address, so the item is listed for a call.
const listChainsWithoutContract = (row: ExportRow, deployments: FileJson[], unmapped: Unmapped[]): void => {
  const deployed = new Set(deployments.map((deployment) => deployment.chain));
  for (const item of new Set(listOf(row.Chain))) {
    const chain = chainOf(item, 'chain');
    if (!chain || deployed.has(chain.slug)) continue;
    unmapped.push({ id: row[RWA_ID], column: 'Chain', value: item, reason: NO_CONTRACT, batch: BATCH.call });
  }
};

const labelDeployments = (row: ExportRow, deployments: FileJson[], unmapped: Unmapped[]): void => {
  const items = listOf(row[HOLDERS]).flatMap((item) =>
    item
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
  for (const item of items) {
    const key = normalizeHolder(item);
    const onChain = 'reason' in key ? [] : deployments.filter((deployment) => deployment.chain === key.chain);
    if ('reason' in key || onChain.length === 0) {
      const reason = 'reason' in key ? key.reason : `no contract of the row on its chain: ${key.chain}`;
      unmapped.push({ id: row[RWA_ID], column: HOLDERS, value: item, reason, batch: BATCH.call });
      continue;
    }
    for (const deployment of onChain) {
      const labels = (deployment.labels ??= []) as FileJson[];
      if (!labels.some((label) => label.address === key.address))
        labels.push({ address: key.address, kind: 'excluded-holder' });
    }
  }
};

const eventsOf = (row: ExportRow, unmapped: Unmapped[]): FileJson[] => {
  const id = row[RWA_ID];
  const review = reviewEvent(row.Suspicious, row['Suspicious Reason?'], (reason, value) =>
    unmapped.push({ id, column: 'Suspicious Reason?', value, reason, batch: BATCH.rows }),
  );
  const attested = isTrue(row.Attestations);
  if (!attested && (valueOf(row['Date of Last Attestation']) || valueOf(row['Attestation Links']))) {
    unmapped.push({
      id,
      column: 'Attestations',
      value: row.Attestations ?? '',
      reason: 'attestation date or links on a row not marked attested',
      batch: BATCH.call,
    });
  }
  return [
    isTrue(row.Delisted) ? delistingEvent() : null,
    review,
    attested ? attestationEvent(row) : null,
    RETIRED.has(Number(id))
      ? {
          kind: 'retirement',
          date: null,
          reason: "listed in the server's RWA_RETIRED_ZERO_IDS",
          note: 'date not in the export',
        }
      : null,
  ].filter((event): event is FileJson => event != null);
};

// The sheet's Llama Attestation Proof: a link is kept as the link, "x" marks that no proof is held (live publishes false).
const attestationProofOf = (row: ExportRow, unmapped: Unmapped[]): string | false | null => {
  const cell = row['Llama Attestation Proof'] ?? '';
  if (cell === '') return null;
  if (cell.toLowerCase() === 'x') return false;
  if (/^https?:\/\/\S+$/.test(cell)) return cell;
  unmapped.push({
    id: row[RWA_ID],
    column: 'Llama Attestation Proof',
    value: cell,
    reason: 'neither a link nor x',
    batch: BATCH.call,
  });
  return null;
};

// Every code of the asset's own items is written, also one an underlying holds, so no cell that held an ISIN is lost.
const identifiersOf = (row: ExportRow, unmapped: Unmapped[]): FileJson[] => {
  const codes = new Set<string>();
  for (const item of listOf(row.ISIN).filter((item) => !/underlying/i.test(item))) {
    const own = isinCodes(item);
    if (own.length === 0)
      unmapped.push({ id: row[RWA_ID], column: 'ISIN', value: item, reason: 'no valid ISIN code', batch: BATCH.call });
    own.forEach((code) => codes.add(code));
  }
  return [...codes].map(sheetIsin);
};

// The cell as written when it holds more than its codes, such as "(Backed cert)", an underlying's code or N/A.
const isinNoteOf = (row: ExportRow, identifiers: FileJson[]): string | null => {
  const cell = valueOf(row.ISIN);
  return cell && cell !== identifiers.map((identifier) => identifier.value).join('; ') ? cell : null;
};

// The published referenceTicker is the underlying's, so a row whose own ticker differs changes; it is listed.
const listTicker = (row: ExportRow, context: ImportContext, unmapped: Unmapped[]): void => {
  const underlying = context.underlyings.underlyings.get(
    context.underlyings.slugOf(valueOf(row['Reference Asset'])) ?? '',
  );
  const own = valueOf(row['Reference Ticker']);
  const published = underlying?.ticker == null ? null : String(underlying.ticker);
  if (own === published) return;
  const reason = `the underlying publishes ticker ${published ?? 'none'}`;
  unmapped.push({ id: row[RWA_ID], column: 'Reference Ticker', value: own ?? '', reason, batch: BATCH.underlyings });
};

// A parent protocol (parent#aave) is kept as written, so the issuer's whole protocol family stays out of its own TVL.
const projectIdsOf = (row: ExportRow, unmapped: Unmapped[]): (number | string)[] =>
  listOf(row['*projectID']).flatMap((item): (number | string)[] => {
    if (/^\d+$/.test(item)) return [Number(item)];
    if (/^parent#[a-z0-9-]+$/.test(item)) return [item];
    unmapped.push({
      id: row[RWA_ID],
      column: '*projectID',
      value: item,
      reason: 'not a protocol id',
      batch: BATCH.call,
    });
    return [];
  });

export const mapAssets = (exports: Exports, context: ImportContext) => {
  const { slugOf, organizations, underlyings } = context;
  const unmapped: Unmapped[] = [];
  const files = new Map<string, FileJson>();
  const spot = exports.markets.filter((row) => rowFate(row) !== 'perps');
  for (const row of spot) {
    const fate = rowFate(row);
    if (fate === 'blank' || fate === 'platform-shaped') {
      unmapped.push({
        id: row[RWA_ID],
        column: MARKET_ID,
        value: row[MARKET_ID] ?? '',
        reason: FATE_REASON[fate],
        batch: BATCH.none,
      });
    }
  }
  const candidates = spot.filter((row) => rowFate(row) === 'asset');
  const slugs = assetSlugs(candidates);
  const held = new Set<ExportRow>();
  for (const row of candidates) {
    for (const gap of gapsOf(row, context)) {
      held.add(row);
      unmapped.push({
        id: row[RWA_ID],
        column: gap.column,
        value: row[gap.column] ?? '',
        reason: `required ${gap.field} missing: the row is held until a patch fills it`,
        batch: gap.batch,
      });
    }
  }
  const written = candidates.filter((row) => !held.has(row)).sort((a, b) => idOf(a) - idOf(b));
  const bySymbol = groupBy(written, (row) => valueOf(row.Ticker) ?? row[MARKET_ID]);
  const wrapsOf = (row: ExportRow): string | null => {
    if (row.Type !== 'Wrapper') return null;
    const inner = (bySymbol.get(valueOf(row['Reference Ticker']) ?? '') ?? []).filter((other) => other !== row);
    const live = inner.length > 1 ? inner.filter((other) => !isTrue(other.Delisted)) : inner;
    if (live.length === 1) return slugs.get(live[0])!;
    unmapped.push({
      id: row[RWA_ID],
      column: 'Reference Ticker',
      value: row['Reference Ticker'] ?? '',
      reason: `wrapper names ${inner.length ? 'several listed tickers' : 'no listed ticker'}`,
      batch: BATCH.call,
    });
    return null;
  };
  for (const row of written) {
    const id = row[RWA_ID];
    const slug = slugs.get(row)!;
    const platform = organizations.platformOf(listOf(row['Parent Platform'])[0])!;
    const deployments = deploymentsOf(row, context, unmapped);
    const identifiers = identifiersOf(row, unmapped);
    labelDeployments(row, deployments, unmapped);
    listChainsWithoutContract(row, deployments, unmapped);
    listTicker(row, context, unmapped);
    const symbol = valueOf(row.Ticker) ?? row[MARKET_ID];
    files.set(`assets/${platform}/${slug}.json`, {
      ...compact({
        slug,
        legacyId: Number(id),
        canonicalMarketId: row[MARKET_ID],
        symbol,
        name: row.Name,
        underlying: underlyings.slugOf(valueOf(row['Reference Asset'])),
        wraps: wrapsOf(row),
        type: slugOf('type', row.Type),
        category: listOf(row.Category).map((label) => slugOf('category', label)),
        assetClass: listOf(row['Asset Class']).map((label) => slugOf('asset-class', label)),
        assetGroup: slugOf('asset-group', row['Asset Group']),
        rwaClassification: slugOf('rwa-classification', row['RWA Classification']),
        primaryChain: (context.chains.use(row['Primary Chain']) as { slug: string }).slug,
        coingeckoId: valueOf(row['*Coingecko ID']),
        issuerProtocolIds: projectIdsOf(row, unmapped),
        identifiers,
        isinNote: isinNoteOf(row, identifiers),
        llamaAttestationProof: attestationProofOf(row, unmapped),
        currency: CURRENCY_OF_SYMBOL[symbol] ?? null,
      }),
      activeMcapReviewed: sheetFlag(row['active mcap data']),
      ...compact({
        suspicious: statedFalse(row.Suspicious),
        delisted: statedFalse(row.Delisted),
        llamaGradeAttestation: sheetFlag(row['Llama Grade Attestation']),
      }),
      ...compact({
        ...Object.fromEntries(FLAGS.map(([column, field]) => [field, checkbox(row[column])])),
        attestationFrequency: valueOf(row['Attestation Frequency']),
        description: valueOf(row['Description/Notes']),
        logo: valueOf(row.Logo),
        registryInfo: valueOf(row['Issuer Registry Info']),
        links: linksOf(row),
        deployments,
        roles: [...new Set(listOf(row.Issuer))].map((item) =>
          compact({
            organization: organizations.issuerOf(item),
            kind: 'issuer',
            sourceLinks: listOf(row['Issuer Source Link'], /[;|]/),
          }),
        ),
        events: eventsOf(row, unmapped),
      }),
    });
  }
  return {
    files,
    unmapped,
    held: held.size,
    platforms: new Set(written.map((row) => organizations.platformOf(listOf(row['Parent Platform'])[0])!)),
  };
};
