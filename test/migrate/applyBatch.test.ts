import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PATCH_COLUMNS } from '../../src/import/applyPatch';
import { applyBatch } from '../../src/migrate/applyBatch';
import { migrateStage } from '../../src/migrate/migrateStage';
import { STAGES } from '../../src/migrate/stages';
import { toCsv } from '../../src/utils/toCsv';
import { runCli } from '../cli/runCli';
import { sheet } from './sheet';

const SOURCE = 'https://assets.backed.fi/products/tesla-xstock';
const TSLAX = 'assets/xstocks/tslax.json';

type Row = Record<string, string>;
const row = (file: string, path: string, old: string, next: string, extra: Row = {}): Row => ({
  file,
  path,
  old,
  new: next,
  source: SOURCE,
  fetchedAt: '2026-10-25',
  agent: 'opus B9-01',
  verified: '',
  ...extra,
});

// The five-row sheet landed by every stage, the registry the batches fix.
const migrated = async () => {
  const paths = sheet();
  for (const stage of STAGES)
    await migrateStage({ ...paths, stage, dryRun: false, patchDir: join(paths.dir, 'patches') });
  return paths;
};

const apply = async (paths: Awaited<ReturnType<typeof migrated>>, rows: Row[], name = 'batch', withExports = false) => {
  const batch = join(paths.dir, `${name}.csv`);
  const columns = [...new Set([...PATCH_COLUMNS, ...rows.flatMap((item) => Object.keys(item))])];
  writeFileSync(batch, toCsv(columns, rows));
  return applyBatch({
    batch,
    root: paths.root,
    out: paths.out,
    dryRun: false,
    patchDir: join(paths.dir, 'patches'),
    exports: withExports ? { markets: paths.markets, platforms: paths.platforms } : null,
  });
};

const read = (root: string, file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'));
const held = (paths: { out: string }, name = 'batch') =>
  readFileSync(join(paths.out, `held-${name}.csv`), 'utf8')
    .trim()
    .split('\n')
    .slice(1);

describe('apply', () => {
  it("lands a row through set with the row's own source in the patch csv, and a second run finds it in place", async () => {
    const paths = await migrated();
    const rows = [row(TSLAX, 'deployments[0].deployedAt', '', '2025-06-27')];

    const first = await apply(paths, rows);
    const text = readFileSync(join(paths.root, TSLAX), 'utf8');
    const second = await apply(paths, rows);

    expect(first).toMatchObject({ added: 1, present: 0, held: 0 });
    expect(read(paths.root, TSLAX).deployments[0]).toMatchObject({ chain: 'solana', deployedAt: '2025-06-27' });
    expect(readFileSync(join(paths.dir, 'patches', '2026-10-25.csv'), 'utf8')).toContain(
      `${TSLAX},deployments[0].deployedAt,,2025-06-27,${SOURCE},2026-10-25,opus B9-01,`,
    );
    expect(second).toMatchObject({ added: 0, present: 1, held: 0 });
    expect(readFileSync(join(paths.root, TSLAX), 'utf8')).toBe(text);
  });

  it('finds a file the import staged flat or in a folder it left, and a field named as the row names it', async () => {
    const paths = await migrated();
    const staged = 'reference/organizations/backed-assets-je-limited.json';
    const left = 'reference/organizations/oracle/backed-assets-je-limited.json';

    const result = await apply(paths, [
      row(staged, 'links.website', '', '["https://backed.fi/"]'),
      row(left, 'kind', 'oracle', 'issuer'),
    ]);

    expect(result).toMatchObject({ added: 1, present: 1, held: 0 });
    expect(read(paths.root, 'reference/organizations/issuer/backed-assets-je-limited.json').about.links).toEqual({
      website: ['https://backed.fi/'],
    });
  });

  it('keeps a path into a block whose name a field shares, as a market names tracks.underlying', async () => {
    const paths = await migrated();

    const result = await apply(paths, [
      row('perps/xyz/nvda.json', 'tracks.underlying', 'nvidia-corporation', 'apple-inc'),
    ]);

    expect(held(paths)).toEqual([]);
    expect(result).toMatchObject({ added: 1 });
    expect(read(paths.root, 'perps/xyz/nvda.json').tracks.underlying).toBe('apple-inc');
  });

  it('leaves a kind row the folder holds already, and moves an organization whose kind changes', async () => {
    const paths = await migrated();
    const staged = 'reference/organizations/backed-assets-je-limited.json';

    const result = await apply(paths, [
      row('assets/xstocks/platform.json', 'kind', 'platform', 'platform'),
      row(staged, 'kind', 'issuer', 'tokenizer'),
    ]);

    expect(held(paths)).toEqual([]);
    expect(result).toMatchObject({ added: 1, present: 1, held: 0 });
    expect(existsSync(join(paths.root, 'reference/organizations/tokenizer/backed-assets-je-limited.json'))).toBe(true);
  });

  it('holds a stale row, an export row given no exports and a row with no source, each with its reason', async () => {
    const paths = await migrated();
    const before = readFileSync(join(paths.root, TSLAX), 'utf8');

    const result = await apply(paths, [
      row(TSLAX, 'identity.name', 'Tesla Stock', 'Tesla xStock Token'),
      row('export:257', 'Oracle Provider', '', 'Chainlink'),
      row(TSLAX, 'terms.redeemable', '', 'true', { source: '' }),
    ]);

    expect(result).toMatchObject({ added: 0, held: 3 });
    expect(held(paths)).toEqual([
      'batch.csv:3,export:257: an export row needs the exports; pass --markets and --platforms',
      `batch.csv:2,"${TSLAX} identity.name: old value ""Tesla Stock"" is not the value found, ""Tesla xStock"""`,
      'batch.csv:4,a batch row needs a source',
    ]);
    expect(readFileSync(join(paths.root, TSLAX), 'utf8')).toBe(before);
  });

  it('lands export rows as migrate maps them: a new underlying through add underlying, the asset through set', async () => {
    const paths = await migrated();
    const rows = [
      row('export:259', 'Reference Asset', 'Apple Inc.', 'Microsoft Corporation'),
      row('export:259', 'Reference Ticker', 'AAPL', 'MSFT'),
    ];

    const first = await apply(paths, rows, 'exports', true);
    const second = await apply(paths, rows, 'exports', true);

    expect(held(paths, 'exports')).toEqual([]);
    expect(first).toMatchObject({ held: 0 });
    expect(first.added).toBeGreaterThanOrEqual(2);
    expect(read(paths.root, 'assets/xstocks/aaplx.json').exposure.underlying).toBe('microsoft-corporation');
    expect(existsSync(join(paths.root, 'reference/underlyings/equity/microsoft-corporation.json'))).toBe(true);
    expect(readFileSync(join(paths.dir, 'patches', '2026-10-25.csv'), 'utf8')).toContain(
      'assets/xstocks/aaplx.json,exposure.underlying,apple-inc,microsoft-corporation,',
    );
    expect(second).toMatchObject({ added: 0, held: 0 });
  });

  it('moves an underlying whose class the export rows change to the folder of its new class', async () => {
    const paths = await migrated();

    const result = await apply(
      paths,
      [row('export:259', 'Asset Group', 'Public Equities', 'Precious Metals')],
      'class',
      true,
    );

    expect(held(paths, 'class')).toEqual([]);
    expect(result).toMatchObject({ held: 0 });
    expect(existsSync(join(paths.root, 'reference/underlyings/equity/apple-inc.json'))).toBe(false);
    expect(read(paths.root, 'reference/underlyings/commodity/apple-inc.json').exposure).toBe('precious-metals');
  });

  it('holds a fold while the event kinds lack merge, then lands it through merge and finds it merged on the next run', async () => {
    const paths = await migrated();
    const fold = row('reference/underlyings/nvidia-corporation.json', 'fold', 'NVIDIA Corporation', 'apple-inc', {
      decision: 'confirmed',
      target: 'apple-inc',
      fetchedAt: '',
    });

    const refused = await apply(paths, [fold], 'folds');
    const reason = held(paths, 'folds')[0];
    await runCli(['add', 'value', '--registry', paths.root, '--vocabulary', 'event-kind', '--label', 'merge']);
    const first = await apply(paths, [fold], 'folds');
    const second = await apply(paths, [fold], 'folds');

    expect(refused).toMatchObject({ added: 0, held: 1 });
    expect(reason).toContain('events[0].kind: ""merge"" is not in vocabulary event-kind');
    expect(first).toMatchObject({ added: 1, held: 0 });
    expect(existsSync(join(paths.root, 'reference/underlyings/equity/nvidia-corporation.json'))).toBe(false);
    expect(read(paths.root, 'assets/xstocks/nvdax.json').exposure.underlying).toBe('apple-inc');
    expect(read(paths.root, 'perps/xyz/nvda.json').tracks.underlying).toBe('apple-inc');
    expect(second).toMatchObject({ added: 0, present: 1, held: 0 });
  });

  it("lands an ack file's rows through ack as one exception", async () => {
    const paths = await migrated();
    const file = '../acks/tslax-flows.json';
    const fields: Row = {
      slug: 'tslax-flows',
      guard: 'flows-hidden',
      asset: 'tslax',
      from: '2026-10-01',
      until: '2026-12-31',
      reason: 'a phantom mint on solana',
      resolve: 'drop when the mint is burned',
    };

    const result = await apply(
      paths,
      Object.entries(fields).map(([path, value]) => row(file, path, '', value)),
    );

    expect(result).toMatchObject({ added: 1, held: 0 });
    expect(read(paths.root, file)).toEqual(fields);
  });
});
