import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

const base = (root: string) => [
  'review',
  'tslax',
  '--registry',
  root,
  '--at',
  '2026-10-24',
  '--source',
  'https://x.example/r',
];

describe('review', () => {
  it('writes a dated review event with its outcome, reason and reviewer', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli([
      ...base(root),
      '--outcome',
      'suspicious',
      '--reason',
      'reserves unattested since June',
      '--reviewer',
      'icellama',
    ]);

    expect(code).toBe(0);
    expect(readJson(root, 'assets/xstocks/tslax.json').events.at(-1)).toEqual({
      kind: 'review',
      date: '2026-10-24',
      outcome: 'suspicious',
      reason: 'reserves unattested since June',
      note: 'reviewed by icellama',
      links: ['https://x.example/r'],
    });
  });

  it('refuses a suspicious outcome without a reason', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli([...base(root), '--outcome', 'suspicious', '--json']);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/--reason/);
  });
});
