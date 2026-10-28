/**
 * The schema module: one zod schema per registry table, the row and file shapes, and the parse of one file.
 * @dev review: src/schema/tables.ts, then src/schema/compileSchemas.ts
 */
import { compileSchemas } from './compileSchemas';
import type { ChildKey } from './defineTable';
import type { TableName } from './enums';
import { tables } from './tables';
import type { z } from 'zod';

export { tables };

export type Tables = typeof tables;
export type Row<T extends TableName> = z.infer<z.ZodObject<ReturnType<Tables[T]['fields']>>>;
export type FileRow<T extends TableName> = Partial<Row<T>> & Partial<Record<ChildKey, Record<string, unknown>[]>>;
export type Registry = { [T in TableName]: Row<T>[] };

export const schemas = compileSchemas(tables, null).rows as {
  [T in TableName]: z.ZodObject<ReturnType<Tables[T]['fields']>>;
};

export { TABLE_NAMES, VOCABULARY_NAMES, ADDRESS_FAMILIES, EVENT_KINDS } from './enums';
export type { TableName, VocabularyName, AddressFamily } from './enums';
export type { Vocabularies } from './compileSchemas';
export { CHILD_KEYS } from './defineTable';
export type { ChildKey } from './defineTable';
export { parseRow } from './parseRow';
export { blockFields, blockNames, fieldPath, rowField, toFile, toRow } from './fileShape';
export { exportJsonSchema } from './exportJsonSchema';
