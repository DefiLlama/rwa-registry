import { describe, expect, it } from 'vitest';
import { checkPatches, patchFiles, type PatchRow } from '../../src/import/applyPatch';

const TSLAX = 'assets/xstocks/tslax.json';
const patch = (fields: Partial<PatchRow>): PatchRow => ({
  file: TSLAX,
  path: 'redeemable',
  old: '',
  new: '',
  source: 'https://assets.backed.fi/products/tesla-xstock',
  fetchedAt: '2026-10-25',
  agent: 'opus',
  verified: '',
  ...fields,
});

describe('applyPatch', () => {
  it('writes unknown as null and lists it', () => {
    const files = new Map([[TSLAX, { slug: 'tslax', redeemable: null, currency: null }]]);

    const { files: patched, problems } = patchFiles(files, [patch({ new: 'unknown' })]);

    expect(patched.get(TSLAX)).toEqual({ slug: 'tslax', redeemable: null, currency: null });
    expect(problems).toEqual([
      expect.objectContaining({ error: 'PatchError', severity: 'warning', path: 'redeemable' }),
    ]);
  });

  it('sets a nested value and leaves a value already patched alone on a rerun', () => {
    const files = new Map([[TSLAX, { slug: 'tslax', deployments: [{ chain: 'solana', deployedAt: null }] }]]);
    const rows = [patch({ path: 'deployments[0].deployedAt', new: '2025-06-30', source: 'https://solscan.io' })];

    const once = patchFiles(files, rows);
    const twice = patchFiles(once.files, rows);

    expect(once.files.get(TSLAX)).toEqual({
      slug: 'tslax',
      deployments: [{ chain: 'solana', deployedAt: '2025-06-30' }],
    });
    expect([...once.problems, ...twice.problems]).toEqual([]);
    expect(twice.files.get(TSLAX)).toEqual(once.files.get(TSLAX));
  });

  it('marks an identifier a patch writes as verified, since the row names the source it was read from', () => {
    const file = 'reference/organizations/securitize-inc.json';
    const lei = {
      scheme: 'lei',
      value: '25490009WOPTX81T8041',
      source: 'https://search.gleif.org/#/record/25490009WOPTX81T8041',
    };
    const files = new Map([[file, { slug: 'securitize-inc' }]]);

    const { files: patched } = patchFiles(files, [
      patch({ file, path: 'identifiers', new: JSON.stringify([lei]), source: lei.source }),
    ]);

    expect(patched.get(file)).toEqual({ slug: 'securitize-inc', identifiers: [{ ...lei, verified: true }] });
  });

  it('refuses a row with no source, an export or oracle row too, and a fetchedAt that is not a date', () => {
    const kept = patch({ file: 'export:257', path: 'Issuer', new: 'Backed', source: 'https://assets.backed.fi' });

    const { rows, problems } = checkPatches([
      kept,
      { ...kept, file: 'export:258', source: '' },
      { ...kept, file: 'export:oracle-map', source: ' ' },
      { ...kept, file: TSLAX, fetchedAt: '25 Oct' },
    ]);

    expect(rows).toEqual([kept]);
    expect(problems.map(({ file, error, severity }) => [file, error, severity])).toEqual([
      ['export:258', 'PatchError', 'error'],
      ['export:oracle-map', 'PatchError', 'error'],
      [TSLAX, 'PatchError', 'error'],
    ]);
  });
});
