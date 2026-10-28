import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PatchRow } from '../../src/import/applyPatch';
import { issuerMerges, organizationHomes, writeHeld } from '../../src/import/heldPatches';

const candidate = (old: string, next: string): PatchRow => ({
  file: `reference/underlyings/${next}-x.json`,
  path: 'fold',
  old,
  new: next,
  source: 'name rule',
  fetchedAt: '',
  agent: 'import pass 0',
  verified: '',
});

const DECIDED = [
  'file,path,old,new,source,fetchedAt,agent,verified,decision,target',
  'reference/underlyings/aflac-x.json,fold,Aflac Inc,aflac,name rule,,import pass 0,,confirmed,aflac-inc',
  '',
].join('\n');

describe('writeHeld', () => {
  it('never overwrites a held file that carries a decision column, and writes new candidates beside it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rwa-held-'));
    writeFileSync(join(dir, 'underlying-folds.csv'), DECIDED);

    writeHeld(dir, 'underlying-folds', [candidate('Aflac Inc', 'aflac'), candidate('Apple Inc', 'apple')]);

    expect(readFileSync(join(dir, 'underlying-folds.csv'), 'utf8')).toBe(DECIDED);
    const fresh = readFileSync(join(dir, 'underlying-folds.new.csv'), 'utf8');
    expect(fresh).toContain('Apple Inc');
    expect(fresh).not.toContain('Aflac Inc');
  });

  it('writes no .new.csv when every candidate is already decided', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rwa-held-'));
    writeFileSync(join(dir, 'underlying-folds.csv'), DECIDED);
    writeFileSync(join(dir, 'underlying-folds.new.csv'), 'stale');

    writeHeld(dir, 'underlying-folds', [candidate('Aflac Inc', 'aflac')]);

    expect(readFileSync(join(dir, 'underlying-folds.csv'), 'utf8')).toBe(DECIDED);
    expect(existsSync(join(dir, 'underlying-folds.new.csv'))).toBe(false);
  });

  it('rewrites a held file with no decision column', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rwa-held-'));
    writeFileSync(join(dir, 'underlying-folds.csv'), 'file,path,old,new,source,fetchedAt,agent,verified\n');

    writeHeld(dir, 'underlying-folds', [candidate('Apple Inc', 'apple')]);

    expect(readFileSync(join(dir, 'underlying-folds.csv'), 'utf8')).toContain('Apple Inc');
    expect(existsSync(join(dir, 'underlying-folds.new.csv'))).toBe(false);
  });
});

describe('issuerMerges', () => {
  it('names the file of the merged organization in its kind folder, as the layout homes it', () => {
    const homes = organizationHomes(
      new Map([
        [
          'reference/organizations/issuer/ondo-finance-inc.json',
          { slug: 'ondo-finance-inc', name: 'Ondo Finance Inc.' },
        ],
        ['assets/ondo-finance/platform.json', { slug: 'ondo-finance', name: 'Ondo Finance' }],
        ['reference/vocabularies/category.json', [{ slug: 'x', label: 'X' }]],
      ]),
    );
    const rows = [{ Issuer: 'Ondo Finance' }, { Issuer: 'Ondo Finance Inc.' }];
    const slugOf = (item: string) => (item === 'Ondo Finance' ? 'ondo-finance' : 'ondo-finance-inc');

    expect(issuerMerges(rows, slugOf, homes)).toEqual([
      expect.objectContaining({
        file: 'reference/organizations/issuer/ondo-finance-inc.json',
        path: 'merge',
        old: 'Ondo Finance Inc.',
        new: 'ondo-finance',
      }),
    ]);
  });
});
