import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, marketWith, writeTree } from '../../fixtures/tree';
import { main } from '../../../src/cli';
import { runCli } from '../runCli';

describe('build', () => {
  it('says in --help that --commit is required, as the run without it prints', async () => {
    const lines: string[] = [];
    const help = main(['build', '--help'], { print: (line) => lines.push(line) });

    await expect(help).rejects.toMatchObject({ code: 'commander.helpDisplayed' });
    expect(lines.join(' ')).toMatch(/--commit <sha>\s+required:/);
    expect((await runCli(['build', '--registry', writeTree(baseTree())])).lines).toEqual([
      'build needs --commit, the commit the registry is built from',
    ]);
  });

  it('refuses a build day before a listing, delisting or review event, so the flags and the status agree', async () => {
    const delisting = { kind: 'delisting', date: '2026-10-26', reason: 'test', links: ['https://x.example/d'] };
    const registry = writeTree({
      ...baseTree(),
      'perps/xyz/tsla.json': marketWith({ delisted: true, events: [delisting] }),
    });
    const out = mkdtempSync(join(tmpdir(), 'rwa-build-'));

    const { code } = await runCli([
      'build',
      '--registry',
      registry,
      '--out',
      out,
      '--commit',
      'abc',
      '--at',
      '2026-10-25',
    ]);

    expect(code).toBe(1);
    expect(readdirSync(out)).toEqual([]);
  });

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

  it('publishes the eleven tables, with no key_change and no instrument', async () => {
    const out = mkdtempSync(join(tmpdir(), 'rwa-build-'));

    await runCli([
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

    expect(Object.keys(JSON.parse(readFileSync(join(out, 'registry.json'), 'utf8')).tables)).toEqual([
      'ack',
      'address_label',
      'asset',
      'deployment',
      'event',
      'organization',
      'perp_market',
      'role',
      'underlying',
      'venue',
      'vocabulary',
    ]);
  });
});
