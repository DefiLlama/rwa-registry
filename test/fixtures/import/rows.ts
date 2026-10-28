/**
 * Hand-built export rows, TSLAx, xyz:TSLA and one Platforms row; a test overrides only its cells, the rest read empty.
 * @dev review: test/import/importExports.test.ts
 */
import type { ExportRow } from '../../../src/import/readExport';

export const assetRow = (cells: ExportRow = {}): ExportRow => ({
  '*RWA ID': '257',
  Ticker: 'TSLAx',
  Name: 'Tesla xStock',
  'Canonical Market ID': 'TSLAx',
  'Primary Chain': 'solana',
  Chain: 'solana; ethereum',
  Contracts: 'solana:XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB; ethereum:0x8AD3c73F833d3F9A523aB01476625F269aEB7Cf0',
  Category: 'Stocks & Equities',
  'Asset Class': 'Stock-Backed',
  Type: 'Asset',
  'RWA Classification': 'True RWA',
  'Access Model': 'Permissioned',
  Issuer: 'Backed Assets (JE) Limited',
  'Parent Platform': 'xStocks',
  'Reference Asset': 'Tesla, Inc.',
  'Reference Ticker': 'TSLA',
  'Asset Group': 'Public Equities',
  'active mcap data': 'TRUE',
  Delisted: 'FALSE',
  Suspicious: 'FALSE',
  Attestations: 'FALSE',
  ...cells,
});

export const perpsRow = (cells: ExportRow = {}): ExportRow => ({
  '*RWA ID': '2921',
  Ticker: 'TSLA',
  Name: 'Tesla Perp',
  'Canonical Market ID': 'xyz:TSLA',
  'Primary Chain': 'hyperliquid',
  Contracts: 'x',
  Category: 'RWA Perps',
  'Asset Class': 'Stock Perp',
  Type: 'Asset',
  'RWA Classification': 'Programmable Finance',
  'Access Model': 'Permissionless',
  'Parent Platform': 'trade[XYZ]',
  'Reference Asset': 'Tesla, Inc.',
  'Reference Ticker': 'TSLA',
  'Asset Group': 'Public Equities',
  'Margin / Settlement Asset': 'USDC',
  '*Fees Maker/Taker': 'Maker 0.015% / Taker 0.045%',
  Delisted: 'FALSE',
  Suspicious: 'FALSE',
  ...cells,
});

export const platformRow = (cells: ExportRow = {}): ExportRow => ({
  '*PID': '12',
  Name: 'xStocks',
  'Primary Chain': 'solana',
  Chain: 'solana',
  Category: 'Stocks & Equities',
  'Access Model': 'Permissioned',
  Delisted: 'FALSE',
  ...cells,
});

export const tradeXyzRow = (cells: ExportRow = {}): ExportRow =>
  platformRow({ '*PID': '219', Name: 'trade[XYZ]', 'Primary Chain': 'hyperliquid', Chain: 'hyperliquid', ...cells });
