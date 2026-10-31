import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
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

describe('add underlying, asked', () => {
  it('asks the name, the exposure and the ticker, and shows the slug and folder it assigns', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ name: 'NVIDIA Corporation', exposure: 'public-equities' });

    const { code } = await runCli(['add', 'underlying', '--registry', root], prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['name', 'exposure', 'ticker', 'logo', 'identifiers', 'confirm']);
    expect(prompter.asked.at(-1)!.message).toContain(
      'file: reference/underlyings/equity/nvidia-corporation.json (assigned)',
    );
  });
});
