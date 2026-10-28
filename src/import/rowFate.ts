/**
 * rowFate: what one markets row becomes, a perps market, a spot asset, or not imported as a blank or platform-shaped row.
 * @dev review: src/import/mapAssets.ts
 */
import { MARKET_ID } from './importTypes';
import { valueOf, type ExportRow } from './readExport';

export type Fate = 'perps' | 'asset' | 'blank' | 'platform-shaped';

// The six xrpl-prefixed ids are spot tokens whose id starts with a chain.
const isPerpsRow = (row: ExportRow): boolean => {
  const id = row[MARKET_ID] ?? '';
  return id.includes(':') && !id.toLowerCase().startsWith('xrpl:');
};

// A blank row holds `x` in every identity cell; its checkboxes and Delisted may still be set (rows 137, 2702, 2704, 8363).
const IDENTITY = [
  'Ticker',
  'Name',
  'Type',
  'Category',
  'Asset Class',
  'Reference Asset',
  'Parent Platform',
  'Contracts',
];

export const FATE_REASON: Record<'blank' | 'platform-shaped', string> = {
  blank: 'blank row: every identity cell is a placeholder',
  'platform-shaped': 'Type Platform with no contract: the platform is its Platforms row',
};

export const rowFate = (row: ExportRow): Fate => {
  if (IDENTITY.every((column) => valueOf(row[column]) == null)) return 'blank';
  if (isPerpsRow(row)) return 'perps';
  return row.Type === 'Platform' && valueOf(row.Contracts) == null ? 'platform-shaped' : 'asset';
};
