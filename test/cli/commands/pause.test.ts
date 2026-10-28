import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

const why = ['--at', '2026-10-24', '--reason', 'maintenance', '--source', 'https://status.example/1'];

describe('pause', () => {
  it('writes a paused event on a venue and unpublishes it', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['pause', 'venue', 'xyz', '--registry', root, ...why]);

    const venue = readJson(root, 'perps/xyz/venue.json');
    expect(code).toBe(0);
    expect(venue.published).toBe(false);
    expect(venue.events).toEqual([
      { kind: 'paused', date: '2026-10-24', reason: 'maintenance', links: ['https://status.example/1'] },
    ]);
  });

  it('refuses to pause a target that is paused', async () => {
    const root = writeTree(baseTree());
    await runCli(['pause', 'asset', 'tslax', '--registry', root, ...why]);

    const { code, lines } = await runCli(['pause', 'asset', 'tslax', '--registry', root, ...why]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/already paused/);
  });
});
