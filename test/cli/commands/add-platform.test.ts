import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { templateFile } from '../../../src/cli/templates';
import { readJson, readText, runCli } from '../runCli';

describe('add platform', () => {
  it('writes assets/<rwaSlug(name)>/platform.json, the kind left to its home, with no PID', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['add', 'platform', '--registry', root, '--name', 'Backed Finance']);

    expect(code).toBe(0);
    expect(readJson(root, 'assets/backed-finance/platform.json')).toEqual({
      identity: { slug: 'backed-finance', name: 'Backed Finance' },
    });
  });

  it('writes from templates/platform.json the file the flags write', async () => {
    const byFlags = writeTree(baseTree());
    const byFile = writeTree(baseTree());

    await runCli(['add', 'platform', '--registry', byFlags, '--name', 'Backed Finance']);
    const { code } = await runCli(['add', 'platform', '--registry', byFile, '--from', templateFile('platform')]);

    expect(code).toBe(0);
    const path = 'assets/backed-finance/platform.json';
    expect(readText(byFile, path)).toBe(readText(byFlags, path));
  });
});
