import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

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
});
