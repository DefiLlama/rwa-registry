import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

const FILE = 'reference/vocabularies/asset-class.json';

describe('add value', () => {
  it('adds the value with slug rwaSlug(label) and keeps the file sorted', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli([
      'add',
      'value',
      '--registry',
      root,
      '--vocabulary',
      'asset-class',
      '--label',
      'Bond Backed',
    ]);

    expect(code).toBe(0);
    expect(readJson(root, FILE)).toEqual([
      { slug: 'bond-backed', label: 'Bond Backed' },
      { slug: 'stock-backed', label: 'Stock-Backed' },
      { slug: 'stock-perp', label: 'Stock Perp' },
    ]);
  });

  it('refuses a slug the vocabulary holds', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli([
      'add',
      'value',
      '--registry',
      root,
      '--vocabulary',
      'asset-class',
      '--label',
      'Stock Backed',
    ]);

    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringMatching(new RegExp(`^${join(root, FILE)}: `))]);
  });
});

describe('add value, asked', () => {
  it('asks the vocabulary and the label before the slug it derives from the label', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ vocabulary: 'asset-class', label: 'Bond Backed' });

    const { code } = await runCli(['add', 'value', '--registry', root], prompter.ask);
    const slug = prompter.asked.find((question) => question.key === 'slug')!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual([
      'vocabulary',
      'label',
      'slug',
      'impliesStablecoin',
      'impliesGovernance',
      'confirm',
    ]);
    expect(slug.default).toBe('bond-backed');
  });
});
