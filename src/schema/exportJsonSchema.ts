/**
 * exportJsonSchema: writes schema/json/<table>.schema.json, the file form of each table for editors, with vocabulary values as plain slugs.
 * @dev review: src/schema/compileSchemas.ts
 */
import { join } from 'node:path';
import { z } from 'zod';
import { compileSchemas } from './compileSchemas';
import { TABLE_NAMES } from './enums';
import { writeFile } from '../utils/writeFile';
import { tables } from './index';

// The tables whose file holds an array of rows.
const ARRAY_FILES = new Set(['vocabulary']);

export const exportJsonSchema = (dir: string): void => {
  const { files } = compileSchemas(tables, null);
  for (const table of TABLE_NAMES) {
    const schema = ARRAY_FILES.has(table) ? z.array(files[table]) : files[table];
    writeFile(join(dir, `${table}.schema.json`), z.toJSONSchema(schema));
  }
};
