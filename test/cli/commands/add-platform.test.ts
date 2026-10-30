import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

describe('add platform', () => {
  it('writes assets/<rwaSlug(name)>/platform.json, the kind left to its home, with no PID', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['add', 'platform', '--registry', root, '--name', 'Backed Finance']);

    expect(code).toBe(0);
    expect(readJson(root, 'assets/backed-finance/platform.json')).toEqual({
      identity: { slug: 'backed-finance', name: 'Backed Finance' },
    });
  });
});
