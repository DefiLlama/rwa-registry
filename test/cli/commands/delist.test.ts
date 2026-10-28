import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

const why = ['--at', '2026-10-24', '--reason', 'venue closed the book', '--source', 'https://x.example/notice'];

describe('delist', () => {
  it('writes a dated delisting event on the market file, which derives the delisted status', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['delist', 'market', 'xyz:TSLA', '--registry', root, ...why]);

    expect(code).toBe(0);
    expect(readJson(root, 'perps/xyz/tsla.json').events).toEqual([
      { kind: 'delisting', date: '2026-10-24', reason: 'venue closed the book', links: ['https://x.example/notice'] },
    ]);
  });

  it('refuses a target that is already delisted and writes nothing', async () => {
    const root = writeTree(baseTree());
    await runCli(['delist', 'market', 'xyz:tsla', '--registry', root, ...why]);
    const before = readFileSync(join(root, 'perps/xyz/tsla.json'), 'utf8');

    const { code, lines } = await runCli(['delist', 'market', 'xyz:tsla', '--registry', root, ...why]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/already delisted/);
    expect(readFileSync(join(root, 'perps/xyz/tsla.json'), 'utf8')).toBe(before);
  });

  it('refuses a slug that names no row of the target table', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(['delist', 'platform', 'nope', '--registry', root, ...why]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/no platform nope/);
  });

  it('delists a venue operator as a platform, since its Platforms tab row is published as one', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['delist', 'platform', 'trade-xyz', '--registry', root, ...why]);

    expect(code).toBe(0);
    expect(readJson(root, 'perps/xyz/organization.json').events.at(-1)).toMatchObject({ kind: 'delisting' });
  });
});
