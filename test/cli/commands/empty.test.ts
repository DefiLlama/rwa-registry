import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE_NAMES } from '../../../src/schema';
import { runCli } from '../runCli';

// The repository before the data lands: registry/ and acks/ hold only a .gitkeep each.
const emptyRepository = () => {
  const repo = mkdtempSync(join(tmpdir(), 'rwa-empty-'));
  for (const dir of ['registry', 'acks']) {
    mkdirSync(join(repo, dir));
    writeFileSync(join(repo, dir, '.gitkeep'), '');
  }
  return join(repo, 'registry');
};

describe('an empty registry', () => {
  it('validates with no problem and builds a registry.json whose every table is empty', async () => {
    const root = emptyRepository();
    const out = mkdtempSync(join(tmpdir(), 'rwa-empty-build-'));

    const validated = await runCli(['validate', '--registry', root, '--json']);
    const built = await runCli(['build', '--registry', root, '--out', out, '--commit', 'empty', '--at', '2026-10-28']);
    const artifact = JSON.parse(readFileSync(join(out, 'registry.json'), 'utf8'));

    expect(validated).toEqual({ code: 0, lines: ['[]'] });
    expect(built.code).toBe(0);
    expect(Object.keys(artifact.tables).sort()).toEqual([...TABLE_NAMES].sort());
    expect(Object.values(artifact.tables).every((rows) => Array.isArray(rows) && rows.length === 0)).toBe(true);
  });
});
