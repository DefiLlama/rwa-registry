import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, undatedTslax, writeTree } from '../../fixtures/tree';
import { runCli } from '../runCli';

describe('validate', () => {
  it('prints one line per warning kind and writes its rows under --out/audit', async () => {
    const root = writeTree({ ...baseTree(), 'assets/xstocks/tslax.json': undatedTslax() });
    const out = mkdtempSync(join(tmpdir(), 'rwa-validate-'));

    const { code, lines } = await runCli(['validate', '--registry', root, '--out', out]);
    const audit = readFileSync(join(out, 'audit', 'undated-deployment.csv'), 'utf8')
      .trim()
      .split('\n');

    expect(code).toBe(0);
    expect(lines).toEqual([expect.stringContaining(join(out, 'audit', 'undated-deployment.csv'))]);
    expect(audit[0]).toBe('file,path,message');
    expect(audit.slice(1)).toHaveLength(2);
  });

  it('exits 1 on a published venue that names no adapter', async () => {
    const xyz = baseTree()['perps/xyz/venue.json'] as object;
    const root = writeTree({ ...baseTree(), 'perps/xyz/venue.json': { ...xyz, adapter: null } });

    const { code, lines } = await runCli(['validate', '--registry', root]);

    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringMatching(new RegExp(`^${join(root, 'perps/xyz/venue.json')}: `))]);
  });
});
