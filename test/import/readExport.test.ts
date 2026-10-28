import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkbox, readExport, sheetFlag, statedFalse } from '../../src/import/readExport';

describe('readExport', () => {
  it('reads checkboxes as checked or TRUE true, FALSE false, x or empty null', () => {
    expect(['checked', 'TRUE', 'FALSE', 'x', ''].map(checkbox)).toEqual([true, true, false, null, null]);
  });

  it('reads a sheet flag as true on TRUE, true or checked, false on FALSE, false, x or unchecked, and a blank as null', () => {
    expect(['TRUE', 'checked', 'FALSE', 'false', 'x', 'unchecked', '', 'maybe'].map(sheetFlag)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      null,
      null,
    ]);
    expect(['TRUE', 'FALSE', 'x', ''].map(statedFalse)).toEqual([null, false, false, null]);
  });

  it('fails the read by name when a column the import reads is missing or renamed', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'rwa-export-')), 'markets.csv');
    writeFileSync(file, '*RWA ID,Ticker,Contract\n257,TSLAx,solana:Xs\n');

    expect(() => readExport(file, ['*RWA ID', 'Ticker', 'Contracts'])).toThrow(
      'lacks the columns the import reads: "Contracts"',
    );
  });
});
