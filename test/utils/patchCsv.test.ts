import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendPatchFile, readPatches, type PatchRow } from '../../src/utils/patchCsv';

const row = (fields: Partial<PatchRow>): PatchRow => ({
  file: 'assets/xstocks/tslax.json',
  path: 'redeemable',
  old: '',
  new: 'true',
  source: 'https://assets.backed.fi/products/tesla-xstock',
  fetchedAt: '2026-10-25',
  agent: 'opus',
  verified: '',
  ...fields,
});

describe('patchCsv', () => {
  it('appends rows under one header, and reads one file or every csv of a folder back in name order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rwa-patches-'));
    const first = join(dir, '2026-10-25.csv');

    appendPatchFile(first, [row({})]);
    appendPatchFile(first, [row({ path: 'currency', new: 'USD' })]);
    appendPatchFile(join(dir, '2026-10-26.csv'), [row({ fetchedAt: '2026-10-26', new: 'a, "quoted" value' })]);

    expect(readPatches(first).map(({ path }) => path)).toEqual(['redeemable', 'currency']);
    expect(readPatches(dir).map(({ new: value }) => value)).toEqual(['true', 'USD', 'a, "quoted" value']);
  });
});
