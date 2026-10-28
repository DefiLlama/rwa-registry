import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { templateFile } from '../../../src/cli/templates';
import { readJson, readText, runCli } from '../runCli';

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

  it('writes from templates/vocabulary-value.json the file the flags write', async () => {
    const byFlags = writeTree(baseTree());
    const byFile = writeTree(baseTree());

    await runCli(['add', 'value', '--registry', byFlags, '--vocabulary', 'asset-class', '--label', 'Bond Backed']);
    const { code } = await runCli(['add', 'value', '--registry', byFile, '--from', templateFile('vocabulary-value')]);

    expect(code).toBe(0);
    expect(readText(byFile, FILE)).toBe(readText(byFlags, FILE));
  });
});
