import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportJsonSchema } from '../../src/schema';

const COMMITTED = 'schema/json';

const filesIn = (dir: string) =>
  Object.fromEntries(
    readdirSync(dir)
      .sort()
      .map((name) => [name, readFileSync(join(dir, name), 'utf8')]),
  );

describe('exportJsonSchema', () => {
  it('equals the committed schema/json, so a schema change without `pnpm schema` fails CI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rwa-json-schema-'));

    exportJsonSchema(dir);

    expect(filesIn(dir)).toEqual(filesIn(COMMITTED));
  });
});
