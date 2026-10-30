import { describe, expect, it } from 'vitest';
import { registryJson } from '../../src/build/registryJson';
import { deriveFields } from '../../src/registry/deriveFields';
import type { Registry } from '../../src/schema';
import { baseTree, registryOf } from '../fixtures/tree';

describe('registryJson', () => {
  it('writes the same bytes for one registry built twice, whatever the key order', () => {
    const registry = deriveFields(registryOf(baseTree()), '2026-10-25');
    const reversed = Object.fromEntries(
      Object.entries(registry).map(([table, rows]) => [
        table,
        (rows as object[]).map((row) => Object.fromEntries(Object.entries(row).reverse())),
      ]),
    ) as Registry;

    expect(registryJson(reversed, 'abc123')).toBe(registryJson(registry, 'abc123'));
  });
});
