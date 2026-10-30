import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { templateFile } from '../../../src/cli/templates';
import { readJson, readText, runCli } from '../runCli';

describe('add underlying', () => {
  it("writes reference/underlyings/<class>/<slug of the name>.json with its exposure, in the folder of the exposure's class", async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli([
      'add',
      'underlying',
      '--registry',
      root,
      '--name',
      'NVIDIA Corporation',
      '--exposure',
      'public-equities',
      '--ticker',
      'NVDA',
    ]);

    expect(code).toBe(0);
    expect(readJson(root, 'reference/underlyings/equity/nvidia-corporation.json')).toEqual({
      slug: 'nvidia-corporation',
      name: 'NVIDIA Corporation',
      ticker: 'NVDA',
      exposure: 'public-equities',
    });
  });

  it('writes from templates/underlying.json the file the flags write', async () => {
    const byFlags = writeTree(baseTree());
    const byFile = writeTree(baseTree());
    const flags = ['--name', 'IonQ, Inc.', '--exposure', 'public-equities', '--ticker', 'IONQ'];

    await runCli(['add', 'underlying', '--registry', byFlags, ...flags]);
    const { code } = await runCli(['add', 'underlying', '--registry', byFile, '--from', templateFile('underlying')]);

    expect(code).toBe(0);
    const path = 'reference/underlyings/equity/ionq-inc.json';
    expect(readText(byFile, path)).toBe(readText(byFlags, path));
  });
});
