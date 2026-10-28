/**
 * migrationCounts: the counts the migration plan states, each with the known cause of a difference, so a rerun writes the same table.
 * @dev review: src/import/importCounts.ts
 */
export interface MigrationCount {
  key: string;
  label: string;
  expected: number | null;
  cause?: string;
}

export const MIGRATION_COUNTS: MigrationCount[] = [
  { key: 'liveAssetRows', label: 'live asset rows (xrpl rows included)', expected: 2880 },
  {
    key: 'liveAssets',
    label: 'live asset files',
    expected: 2880,
    cause: '32 live rows are held for a required value (unmapped.csv, reason required)',
  },
  {
    key: 'delistedAssets',
    label: 'delisted asset files',
    expected: 1886,
    cause: '2 delisted rows are held for a required value',
  },
  { key: 'assets', label: 'asset files', expected: 4766, cause: 'the 34 held rows' },
  {
    key: 'liveDeployments',
    label: 'deployments of live assets',
    expected: 13767,
    cause:
      '+6 contracts of the six xrpl rows, which the plan counted as perps; +4 bare XRPL issuers kept as written; -43 on the 32 held rows; -41 malformed items listed',
  },
  {
    key: 'delistedDeployments',
    label: 'deployments of delisted assets',
    expected: 2004,
    cause: '-2 on the 2 held rows; -1 malformed item listed',
  },
  { key: 'perpsRows', label: 'perps rows', expected: 4881 },
  { key: 'markets', label: 'market files', expected: 4810 },
  { key: 'mergedPerpsRows', label: 'perps rows merged into another', expected: 71 },
  {
    key: 'venues',
    label: 'venue files',
    expected: 50,
    cause: 'the hyperliquid parent venue of the HIP-3 dexes has no prefix row of its own (the plan counts 51)',
  },
  {
    key: 'underlyings',
    label: 'underlying files',
    expected: 3929,
    cause: '62 spellings sit only on the 70 rows not imported',
  },
  {
    key: 'organizations',
    label: 'organization files',
    expected: 815,
    cause:
      "+6 Parent Platform names with no Platforms row are written as bare platforms at pass 0; -2 issuer items (Tokeshare, RISEx) are those platforms; -1 STASIS is the Stasis platform, which the plan's 465 counts",
  },
  {
    key: 'notImported',
    label: 'legacy ids not imported (blank and platform-shaped rows)',
    expected: 71,
    cause:
      '70 distinct ids: 66 platform-shaped rows (3234 among them) and 4 blank rows (8363 among them); 71 and 72 count one of them twice',
  },
  {
    key: 'heldRows',
    label: 'asset rows held for a missing required value',
    expected: 0,
    cause: 'the plan holds no row; 41 gaps on 34 rows wait for batches 05, 07, 09 or a call',
  },
  {
    key: 'malformedContracts',
    label: 'contract items listed as malformed',
    expected: 42,
    cause:
      "42 is the profile's pattern count; pass 0 checks the registry key forms: +21 items on chains with no address family or on non-chains, -11 Cosmos denoms the SDK denom rule accepts, -1 address with a leading space trimmed; XRPL items are kept as the sheet writes them, the 4 bare issuers included",
  },
  { key: 'vocabulary:category', label: 'category values', expected: 18 },
  { key: 'vocabulary:asset-class', label: 'asset class values', expected: 78 },
  { key: 'vocabulary:asset-group', label: 'asset group values', expected: 28 },
  {
    key: 'vocabulary:access-model',
    label: 'access model values',
    expected: 4,
    cause: "the exports hold 3 values; the plan's 3 plus Custodial Only counts Custodial Only twice",
  },
  { key: 'vocabulary:rwa-classification', label: 'classification values', expected: 5 },
  { key: 'vocabulary:type', label: 'type values', expected: 3 },
  {
    key: 'holderItems',
    label: 'holder items',
    expected: 15746,
    cause: '21 items sit on the blank and platform-shaped rows not imported',
  },
  {
    key: 'holderItemsListed',
    label: 'holder items listed',
    expected: 176,
    cause: '21 on rows not imported and 6 on held rows are not checked at pass 0',
  },
];
