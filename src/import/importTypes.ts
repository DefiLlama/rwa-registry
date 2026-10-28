/**
 * importTypes: the shapes the import modules share, the registry files by path and the unmapped rows with the batch that owns each.
 * @dev review: src/import/importExports.ts
 */
import type { ExportRow } from './readExport';

export type FileJson = Record<string, unknown>;
export type RegistryFiles = Map<string, FileJson | FileJson[]>;

export interface Unmapped {
  id: string;
  column: string;
  value: string;
  reason: string;
  batch: string;
}

export interface Call {
  topic: string;
  line: string;
}

export interface Exports {
  markets: ExportRow[];
  platforms: ExportRow[];
}

// The patch batch that fills a gap; "call" waits for Akif after cutover, "none" is final.
export const BATCH = {
  venues: '01-04 venues',
  underlyings: '05-06 underlyings',
  organizations: '07-08 organizations',
  rows: '09 rows',
  call: 'call after cutover',
  none: 'none',
} as const;

export const RWA_ID = '*RWA ID';
export const MARKET_ID = 'Canonical Market ID';
