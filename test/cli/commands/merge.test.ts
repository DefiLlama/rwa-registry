import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetFile, baseTree, marketWith, tslaxWith, writeTree, type Tree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

const why = ['--at', '2026-10-25', '--reason', 'one issuer under two spellings', '--source', 'https://x.example/m'];
const LTD = 'reference/organizations/issuer/xstocks-ltd.json';
// xStocks, which holds a legacy PID, and a second spelling of it as an issuer.
const withLtd = (extra: Tree = {}) =>
  writeTree({ ...baseTree(), [LTD]: { identity: { slug: 'xstocks-ltd', name: 'xStocks Ltd.' } }, ...extra });

describe('merge', () => {
  it('moves every reference from drop to keep, keeps the dropped name in the merge event, and removes drop', async () => {
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
    expect(keep.name).toBe('Tesla, Inc.');
    expect(keep).not.toHaveProperty('aliases');
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

  it('with --force merges two platforms and moves the assets of the dropped one into the kept folder', async () => {
    const root = writeTree({
      ...baseTree(),
      'assets/backed/platform.json': { identity: { slug: 'backed', name: 'Backed Finance', legacyPid: 31 } },
      'assets/backed/wtslax.json': assetFile('wtslax', 300, {
        roles: [{ organization: 'backed-assets-je-limited', kind: 'issuer' }],
      }),
    });

    const { code, lines } = await runCli([
      'merge',
      'organization',
      'xstocks',
      'backed',
      '--registry',
      root,
      ...why,
      '--force',
    ]);

    expect(code).toBe(0);
    expect(lines).toEqual([
      `wrote ${join(root, 'assets/xstocks/wtslax.json')}`,
      `removed ${join(root, 'assets/backed/wtslax.json')}`,
      `wrote ${join(root, 'assets/xstocks/platform.json')}`,
      `removed ${join(root, 'assets/backed/platform.json')}`,
    ]);
    expect(readJson(root, 'assets/xstocks/wtslax.json').identity).toMatchObject({ slug: 'wtslax', legacyId: 300 });
    expect(existsSync(join(root, 'assets/backed/wtslax.json'))).toBe(false);
    expect((await runCli(['validate', '--registry', root])).code).toBe(0);
  });

  it('refuses a table other than organization and underlying', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(['merge', 'asset', 'tslax', 'wtslax', '--registry', root, ...why]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/merges organization or underlying/);
  });
});

describe('merge, asked', () => {
  const answers = { reason: 'one issuer under two spellings', source: 'https://x.example/m', at: '2026-10-25' };
  const withTesla = () =>
    writeTree({
      ...baseTree(),
      'reference/underlyings/equity/tesla.json': { slug: 'tesla', name: 'Tesla', exposure: 'public-equities' },
    });

  it('asks the table, keep, drop among the others, the reason, the source, the day and --force, then merges', async () => {
    const root = withTesla();
    const prompter = fakeAsk({ table: 'underlying', keep: 'tesla-inc', drop: 'tesla', ...answers });

    const { code } = await runCli(['merge', '--registry', root], prompter.ask);
    const question = (key: string) => prompter.asked.find((asked) => asked.key === key)!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['table', 'keep', 'drop', 'reason', 'source', 'at', 'force', 'confirm']);
    expect(question('keep').choices).toEqual(['tesla', 'tesla-inc']);
    expect(question('drop').choices).toEqual(['tesla']);
    expect(prompter.asked.at(-1)!.message).toContain('drop: tesla');
    expect(existsSync(join(root, 'reference/underlyings/equity/tesla.json'))).toBe(false);
  });

  it('skips the question of each argument given', async () => {
    const root = withTesla();
    const prompter = fakeAsk({ drop: 'tesla', ...answers });

    const { code } = await runCli(['merge', 'underlying', 'tesla-inc', '--registry', root], prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['drop', 'reason', 'source', 'at', 'force', 'confirm']);
  });

  it('refuses missing arguments under --no-input', async () => {
    const root = withTesla();

    const { code, lines } = await runCli(['merge', 'underlying', '--registry', root, '--no-input', ...why]);

    expect(code).toBe(1);
    expect(lines).toEqual(['merge: <keep> is required', 'merge: <drop> is required']);
  });
});
