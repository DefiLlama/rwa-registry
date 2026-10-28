import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

const RULES = 'reference/vocabularies/category-rules.json';
const add = (root: string, structure: string, exposure: string, category: string) =>
  runCli(['add', 'rule', '--registry', root, '--structure', structure, '--exposure', exposure, '--category', category]);

describe('add rule', () => {
  it('adds the rule and keeps the file sorted by structure, then exposure', async () => {
    const root = writeTree(baseTree());
    const before = readJson(root, RULES);

    const { code } = await add(root, 'stock-perp', 'public-equities', 'rwa-perps');

    expect(code).toBe(0);
    expect(readJson(root, RULES)).toEqual(
      [...before, { structure: 'stock-perp', exposure: 'public-equities', category: ['rwa-perps'] }].sort(
        (a, b) => a.structure.localeCompare(b.structure) || a.exposure.localeCompare(b.exposure),
      ),
    );
  });

  it('refuses a pair the file holds a rule for', async () => {
    const root = writeTree(baseTree());
    const [rule] = readJson(root, RULES);

    const { code, lines } = await add(root, rule.structure, rule.exposure, 'stocks-equities');

    expect(code).toBe(1);
    expect(lines).toEqual([
      `${join(root, RULES)}: a rule for ${rule.structure} and ${rule.exposure} is already in the file`,
    ]);
  });
});
