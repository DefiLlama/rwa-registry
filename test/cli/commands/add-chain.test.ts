import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { templateFile } from '../../../src/cli/templates';
import { readJson, readText, runCli } from '../runCli';

describe('add chain', () => {
  it("writes reference/chains/<slug>.json with its address family and that family's burn addresses", async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['add', 'chain', '--registry', root, '--name', 'Dusk', '--family', 'evm']);

    expect(code).toBe(0);
    expect(readJson(root, 'reference/chains/dusk.json')).toEqual({
      slug: 'dusk',
      label: 'Dusk',
      addressFamily: 'evm',
      burnAddresses: ['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead'],
    });
  });

  it('writes from templates/chain.json the file the flags write', async () => {
    const byFlags = writeTree(baseTree());
    const byFile = writeTree(baseTree());

    await runCli(['add', 'chain', '--registry', byFlags, '--name', 'Dusk', '--family', 'evm']);
    const { code } = await runCli(['add', 'chain', '--registry', byFile, '--from', templateFile('chain')]);

    expect(code).toBe(0);
    expect(readText(byFile, 'reference/chains/dusk.json')).toBe(readText(byFlags, 'reference/chains/dusk.json'));
  });
});
