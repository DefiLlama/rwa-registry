import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
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

describe('add platform, asked', () => {
  it('asks the name and shows the slug it assigns at the confirmation', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ name: 'Backed Finance' });

    const { code } = await runCli(['add', 'platform', '--registry', root], prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['name', 'confirm']);
    expect(prompter.asked.at(-1)!.message).toContain('slug: backed-finance (assigned)');
  });
});
