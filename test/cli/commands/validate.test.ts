import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, tslaxWith, undatedTslax, writeTree, xyzVenue } from '../../fixtures/tree';
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

describe('validate <path>', () => {
  const TSLAX = 'assets/xstocks/tslax.json';
  const outside = () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rwa-outside-')), 'tslax.json');
    writeFileSync(path, '{}');
    return path;
  };

  it('prints only the problems of that file, its bad reference among them, and exits 1', async () => {
    const root = writeTree({
      ...baseTree(),
      [TSLAX]: tslaxWith({ underlying: 'tesla-incc' }),
      'perps/xyz/venue.json': { ...xyzVenue(), adapter: null },
    });

    const { code, lines } = await runCli(['validate', '--registry', root, join(root, TSLAX)]);

    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringMatching(new RegExp(`^${join(root, TSLAX)}: .*tesla-incc`))]);
  });

  it('says a valid file has no errors and exits 0', async () => {
    const root = writeTree({ ...baseTree(), 'perps/xyz/venue.json': { ...xyzVenue(), adapter: null } });

    const { code, lines } = await runCli(['validate', '--registry', root, join(root, TSLAX)]);

    expect(code).toBe(0);
    expect(lines).toEqual([`${join(root, TSLAX)}: no errors`]);
  });

  it('names a key another file also holds, though the check reports it on the other file', async () => {
    const twin = tslaxWith({ slug: 'tslay', legacyId: 9999 });
    const root = writeTree({ ...baseTree(), 'assets/xstocks/tslay.json': twin });

    const { code, lines } = await runCli(['validate', '--registry', root, join(root, TSLAX)]);

    expect(code).toBe(1);
    expect(lines).toContain(
      `${join(root, 'assets/xstocks/tslay.json')}: asset canonicalMarketId TSLAx is also on asset tslax`,
    );
  });

  it.each([
    ['a file that does not exist', (root: string) => join(root, 'assets/xstocks/nope.json'), 'no such file'],
    ['a file outside the registry', () => outside(), 'is not in the registry folder'],
  ])('refuses %s and exits 1', async (_, path, message) => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(['validate', '--registry', root, path(root)]);

    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringContaining(message)]);
  });
});
