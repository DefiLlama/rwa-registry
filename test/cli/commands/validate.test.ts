import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, undatedTslax, writeTree, xyzVenue } from '../../fixtures/tree';
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

  it('without --out, names the flag with its folder as --help writes it, since a bare --out is refused', async () => {
    const root = writeTree({ ...baseTree(), 'assets/xstocks/tslax.json': undatedTslax() });

    const { code, lines } = await runCli(['validate', '--registry', root]);

    expect(code).toBe(0);
    expect(lines).toEqual(['warning: undated-deployment: 2 (pass --out <dir> to list them)']);
  });

  it('exits 1 on a published venue that names no adapter', async () => {
    const root = writeTree({ ...baseTree(), 'perps/xyz/venue.json': { ...xyzVenue(), adapter: null } });

    const { code, lines } = await runCli(['validate', '--registry', root]);

    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringMatching(new RegExp(`^${join(root, 'perps/xyz/venue.json')}: `))]);
  });

  it('has no --base, so nothing is checked against main', async () => {
    const root = writeTree(baseTree());

    await expect(runCli(['validate', '--registry', root, '--base', root])).rejects.toMatchObject({
      code: 'commander.unknownOption',
    });
  });
});
