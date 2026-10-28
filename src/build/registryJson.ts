/**
 * registryJson: the derived registry as one line of JSON with sorted keys and no timestamp, so two builds of one registry are byte equal.
 * @dev review: src/cli/commands/build.ts
 */
import { TABLE_NAMES, type Registry } from '../schema';

const ARTIFACT_VERSION = 1;

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  );
};

export const registryJson = (registry: Registry, commit: string): string =>
  `${JSON.stringify(
    sortKeys({
      version: ARTIFACT_VERSION,
      commit,
      tables: Object.fromEntries(TABLE_NAMES.map((table) => [table, registry[table]])),
    }),
  )}\n`;
