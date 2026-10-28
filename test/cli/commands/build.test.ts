import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { runCli } from '../runCli';

describe('build', () => {
  it('writes registry.json alone under --out, with version 1 and the commit', async () => {
    const out = mkdtempSync(join(tmpdir(), 'rwa-build-'));

    const { code } = await runCli([
      'build',
      '--registry',
      writeTree(baseTree()),
      '--out',
      out,
      '--commit',
      'abc123',
      '--at',
      '2026-10-25',
    ]);

    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(out, 'registry.json'), 'utf8'))).toMatchObject({
      version: 1,
      commit: 'abc123',
    });
    expect(readdirSync(out)).toEqual(['registry.json']);
  });
});
