import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importExports } from '../../src/import/importExports';
import { migrateStage } from '../../src/migrate/migrateStage';
import { STAGES, type Stage } from '../../src/migrate/stages';
import { PATCH_COLUMNS } from '../../src/import/applyPatch';
import { loadRegistry } from '../../src/registry';
import { baseTree, errorsIn, writeTree } from '../fixtures/tree';
import { toCsv } from '../../src/utils/toCsv';
import { assetRow } from '../fixtures/import/rows';
import { fiveRows, sheet } from './sheet';

type Sheet = ReturnType<typeof sheet>;

const run = (paths: Sheet, stage: Stage, dryRun = false, more: { batches?: string; fromRegistry?: string } = {}) =>
  migrateStage({ ...paths, stage, dryRun, patchDir: join(paths.dir, 'patches'), ...more });

const json = (root: string, file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'));

const landAll = async (paths: Sheet) => {
  for (const stage of STAGES) await run(paths, stage);
};

const files = (root: string): string[] =>
  existsSync(root)
    ? readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
        .sort()
    : [];

describe('migrate', () => {
  it('lands a five-row sheet stage by stage into an empty registry as the files the import writes, and it validates', async () => {
    // A file read with its nulls left out: an add command writes no null, where the import wrote deployedAt: null.
    const withoutNulls = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(withoutNulls)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([, inner]) => inner !== null)
                .map(([key, inner]) => [key, withoutNulls(inner)]),
            )
          : value;
    const migrated = sheet();
    const imported = sheet();

    await landAll(migrated);
    importExports({ ...imported, patches: null, dates: null });
    // The import writes a vocabulary the sheet gives no value, as an empty list; migrate has no value to add.
    const expected = files(imported.root).filter((file) => file !== 'reference/vocabularies/revenue-confidence.json');

    expect(files(migrated.root)).toEqual(expected);
    for (const file of expected) {
      const read = (root: string) => withoutNulls(JSON.parse(readFileSync(join(root, file), 'utf8')));
      expect([file, read(migrated.root)]).toEqual([file, read(imported.root)]);
    }
    expect(errorsIn(loadRegistry(migrated.root).problems)).toEqual([]);
  });

  it("holds a row its command refuses with the command's reason, writes no file for it and lands the rest", async () => {
    const paths = sheet([
      ...fiveRows(),
      assetRow({
        '*RWA ID': '260',
        Ticker: 'COINx',
        'Canonical Market ID': 'COINx',
        Issuer: '',
        Contracts: 'solana:XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1',
        Chain: 'solana',
      }),
    ]);

    for (const stage of STAGES.slice(0, 5)) await run(paths, stage);
    const result = await run(paths, 'assets');

    expect(result).toMatchObject({ added: 3, present: 0, held: 1 });
    expect(readFileSync(join(paths.out, 'held-assets.csv'), 'utf8').trim().split('\n').slice(1)).toEqual([
      'assets/xstocks/coinx.json,add asset: an asset needs an issuer role; pass --issuer or add one to roles',
    ]);
    expect(existsSync(join(paths.root, 'assets/xstocks/coinx.json'))).toBe(false);
    expect(readFileSync(result.report, 'utf8')).toContain(
      '- 1: an asset needs an issuer role; pass --issuer or add one to roles',
    );
  });

  it('changes nothing when a stage runs twice: the add command refuses each existing key, counted as present', async () => {
    const paths = sheet();
    await landAll(paths);
    const texts = () => files(paths.root).map((file) => readFileSync(join(paths.root, file), 'utf8'));
    const before = texts();

    const again = [];
    for (const stage of STAGES) again.push(await run(paths, stage));

    expect(texts()).toEqual(before);
    expect(again.map(({ added, held }) => [added, held])).toEqual(STAGES.map(() => [0, 0]));
    expect(again.every(({ present }) => present > 0)).toBe(true);
  });

  it('writes the report and no registry file on a dry run', async () => {
    const paths = sheet();

    const result = await run(paths, 'vocabularies', true);

    expect(result.added).toBeGreaterThan(0);
    expect(files(paths.root)).toEqual([]);
    expect(readFileSync(result.report, 'utf8')).toMatch(/^# migrate vocabularies \(dry run\)/);
  });

  it("lands the vocabularies and category rules of --from-registry, the sheet's values folded in", async () => {
    const paths = sheet();
    const sheetOnly = sheet();
    await run(sheetOnly, 'vocabularies');

    const decided = writeTree(baseTree());
    const result = await run(paths, 'vocabularies', false, { fromRegistry: decided });

    const slugs = (root: string, name: string) =>
      json(root, `reference/vocabularies/${name}.json`).map((value: { slug: string }) => value.slug);
    expect(result.held).toBe(0);
    for (const name of ['role-kind', 'event-kind', 'asset-class']) {
      expect(slugs(paths.root, name)).toEqual(
        expect.arrayContaining([...slugs(decided, name), ...slugs(sheetOnly.root, name)]),
      );
    }
    expect(json(paths.root, 'reference/vocabularies/category-rules.json')).toEqual(
      expect.arrayContaining(json(decided, 'reference/vocabularies/category-rules.json')),
    );
  });

  it('reads the oracle map from --batches, so an oracle role lands with its Oracle Proof Link', async () => {
    const paths = sheet([
      assetRow({ 'Oracle Provider': 'Chainlink', 'Oracle Proof Link': 'https://data.chain.link/tslax' }),
      ...fiveRows().slice(1),
    ]);
    const batches = join(paths.dir, 'batches');
    mkdirSync(batches);
    const row = (file: string, old: string, next: object) => ({
      file,
      path: 'Oracle Provider',
      old,
      new: JSON.stringify(next),
      source: 'https://chain.link/',
      fetchedAt: '2026-10-25',
      agent: 'opus B9-07',
      verified: '',
    });
    const rows = [
      row('export:oracle-firm', '', {
        slug: 'chainlink',
        name: 'Chainlink',
        kind: 'brand',
        website: 'https://chain.link/',
      }),
      row('export:oracle-map', 'Chainlink', { kind: 'oracle', organization: 'chainlink', note: null }),
    ];
    writeFileSync(join(batches, '07.csv'), toCsv(PATCH_COLUMNS, rows));

    for (const stage of STAGES) await run(paths, stage, false, { batches });

    expect(json(paths.root, 'assets/xstocks/tslax.json').roles).toContainEqual({
      organization: 'chainlink',
      kind: 'oracle',
      sourceLinks: ['https://data.chain.link/tslax'],
    });
  });
});
