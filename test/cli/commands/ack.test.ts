import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

const ack = (root: string) => [
  'ack',
  'tslax',
  '--registry',
  root,
  '--guard',
  'flows-hidden',
  '--from',
  '2026-10-24',
  '--until',
  '2026-11-30',
  '--reason',
  'mint spike on solana',
  '--resolve',
  'drop when the solana supply settles',
];

describe('ack', () => {
  it('writes ../acks/<asset>-flows.json beside the registry in the ack shape', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(ack(root));

    expect(code).toBe(0);
    expect(readJson(root, '../acks/tslax-flows.json')).toEqual({
      slug: 'tslax-flows',
      guard: 'flows-hidden',
      asset: 'tslax',
      from: '2026-10-24',
      until: '2026-11-30',
      reason: 'mint spike on solana',
      resolve: 'drop when the solana supply settles',
    });
  });

  it('writes an open-ended ack with until null when --until is left out, and validate finds nothing new', async () => {
    const root = writeTree(baseTree());
    const args = ack(root);
    args.splice(args.indexOf('--until'), 2);
    const before = await runCli(['validate', '--registry', root]);

    const { code } = await runCli(args);
    const after = await runCli(['validate', '--registry', root]);

    expect(code).toBe(0);
    expect(readJson(root, '../acks/tslax-flows.json')).toMatchObject({ until: null, reason: 'mint spike on solana' });
    expect(after.lines).toEqual(before.lines);
  });
});
