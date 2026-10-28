import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, marketWith, tslaxWith, writeTree, type Tree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

const why = ['--at', '2026-10-25', '--reason', 'one issuer under two spellings', '--source', 'https://x.example/m'];
const LTD = 'reference/organizations/issuer/xstocks-ltd.json';
// xStocks, which holds a legacy PID, and a second spelling of it as an issuer.
const withLtd = (extra: Tree = {}) =>
  writeTree({ ...baseTree(), [LTD]: { identity: { slug: 'xstocks-ltd', name: 'xStocks Ltd.' } }, ...extra });

describe('merge', () => {
  it('moves every reference from drop to keep, keeps the name as an alias, writes the event and removes drop', async () => {
    const root = writeTree({
      ...baseTree(),
      'reference/underlyings/equity/tesla.json': { slug: 'tesla', name: 'Tesla', exposure: 'public-equities' },
      'perps/xyz/tsla.json': marketWith({ tracks: 'tesla' }),
    });

    const { code, lines } = await runCli(['merge', 'underlying', 'tesla-inc', 'tesla', '--registry', root, ...why]);

    expect(code).toBe(0);
    expect(lines).toEqual([
      `wrote ${join(root, 'perps/xyz/tsla.json')}`,
      `wrote ${join(root, 'reference/underlyings/equity/tesla-inc.json')}`,
      `removed ${join(root, 'reference/underlyings/equity/tesla.json')}`,
    ]);
    expect(readJson(root, 'perps/xyz/tsla.json').tracks.underlying).toBe('tesla-inc');
    const keep = readJson(root, 'reference/underlyings/equity/tesla-inc.json');
    expect(keep.aliases).toEqual(['Tesla']);
    expect(keep.events).toEqual([
      {
        kind: 'merge',
        date: '2026-10-25',
        reason: 'one issuer under two spellings',
        note: 'merged tesla (Tesla)',
        links: ['https://x.example/m'],
      },
    ]);
    expect(existsSync(join(root, 'reference/underlyings/equity/tesla.json'))).toBe(false);
  });

  it('refuses a row that holds a legacy id the app keys on, without --force', async () => {
    const root = withLtd();

    const { code, lines } = await runCli([
      'merge',
      'organization',
      'xstocks',
      'xstocks-ltd',
      '--registry',
      root,
      ...why,
    ]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/xstocks holds legacyPid 12.*--force/);
    expect(existsSync(join(root, LTD))).toBe(true);
  });

  it('with --force merges into a keep that holds the legacy id, roles moved', async () => {
    const root = withLtd({
      'assets/xstocks/tslax.json': tslaxWith({ roles: [{ organization: 'xstocks-ltd', kind: 'issuer' }] }),
    });

    const { code } = await runCli([
      'merge',
      'organization',
      'xstocks',
      'xstocks-ltd',
      '--registry',
      root,
      ...why,
      '--force',
    ]);

    expect(code).toBe(0);
    expect(readJson(root, 'assets/xstocks/tslax.json').roles).toEqual([{ organization: 'xstocks', kind: 'issuer' }]);
    expect(readJson(root, 'assets/xstocks/platform.json').events.at(-1).note).toBe('merged xstocks-ltd (xStocks Ltd.)');
  });

  it('refuses a table other than organization and underlying', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(['merge', 'asset', 'tslax', 'wtslax', '--registry', root, ...why]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/merges organization or underlying/);
  });
});
