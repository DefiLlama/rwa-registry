import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

const why = (day: string) => ['--at', day, '--reason', 'trading again', '--source', 'https://x.example/notice'];

describe('relist', () => {
  it('relists a delisted platform: a dated listing event and delisted false', async () => {
    const [kind, slug, file] = ['platform', 'xstocks', 'assets/xstocks/platform.json'];
    const root = writeTree(baseTree());
    await runCli(['delist', kind, slug, '--registry', root, ...why('2026-10-24')]);

    const { code } = await runCli(['relist', kind, slug, '--registry', root, ...why('2026-10-25')]);

    expect(code).toBe(0);
    expect(readJson(root, file).review).toMatchObject({ suspicious: false, delisted: false });
    expect(readJson(root, file).events.at(-1)).toEqual({
      kind: 'listing',
      date: '2026-10-25',
      reason: 'trading again',
      links: ['https://x.example/notice'],
    });
  });

  it('refuses a target that is not delisted and writes nothing', async () => {
    const root = writeTree(baseTree());
    const before = readFileSync(join(root, 'perps/xyz/tsla.json'), 'utf8');

    const { code } = await runCli(['relist', 'market', 'xyz:tsla', '--registry', root, ...why('2026-10-25')]);

    expect(code).toBe(1);
    expect(readFileSync(join(root, 'perps/xyz/tsla.json'), 'utf8')).toBe(before);
  });
});
