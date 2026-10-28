/**
 * compileSchemas: the row and file schema of every table, the file's fields in their named blocks, with each vocabulary field an enum of its file's slugs, or a plain slug when none are given.
 * @dev review: src/schema/parseRow.ts
 */
import { z } from 'zod';
import type { AnyTableDefinition, VocabularyTypes } from './defineTable';
import { TABLE_NAMES, VOCABULARY_NAMES, type TableName, type VocabularyName } from './enums';
import { placesOfTable } from './fileShape';
import { slug } from './primitives';

export type Vocabularies = Partial<Record<VocabularyName, readonly string[]>>;

export interface Compiled {
  rows: Record<TableName, z.ZodObject>;
  files: Record<TableName, z.ZodObject>;
}

const vocabularyEnum = (name: VocabularyName, values: readonly string[]): z.ZodType<string> =>
  values.length === 0
    ? z.string().refine(() => false, `vocabulary file ${name}.json is missing or empty`)
    : z.enum(values as [string, ...string[]], {
        error: (issue) => `"${String(issue.input)}" is not in vocabulary ${name}`,
      });

const vocabularyTypes = (vocabularies: Vocabularies | null): VocabularyTypes =>
  Object.fromEntries(
    VOCABULARY_NAMES.map((name) => [
      name,
      vocabularies
        ? vocabularyEnum(name, vocabularies[name] ?? [])
        : slug.describe(`a slug of registry/reference/vocabularies/${name}.json`),
    ]),
  ) as VocabularyTypes;

// A block is required when a field in it is.
const blockSchema = (inner: Record<string, z.core.$ZodType>) => {
  const object = z.strictObject(inner);
  return Object.values(inner).some((type) => !(type as z.ZodType).safeParse(undefined).success)
    ? object
    : object.optional();
};

const memo = new WeakMap<object, Compiled>();
let staticCompiled: Compiled | null = null;

export const compileSchemas = (
  tables: Record<TableName, AnyTableDefinition>,
  vocabularies: Vocabularies | null,
): Compiled => {
  const cached = vocabularies ? memo.get(vocabularies) : staticCompiled;
  if (cached) return cached;
  const v = vocabularyTypes(vocabularies);
  const files = {} as Record<TableName, z.ZodObject>;
  const fileSchema = (name: TableName): z.ZodObject => {
    if (files[name]) return files[name];
    const definition = tables[name];
    const fields: Record<string, z.core.$ZodType> = { ...definition.fields(v) };
    for (const key of [definition.implied, ...(definition.build ?? [])]) if (key) delete fields[key];
    const order: string[] = [];
    const blocks: Record<string, Record<string, z.core.$ZodType>> = {};
    for (const [field, type] of Object.entries(fields)) {
      const place = placesOfTable(name).get(field);
      if (!order.includes(place?.block ?? field)) order.push(place?.block ?? field);
      if (place) (blocks[place.block] ??= {})[place.key] = type;
    }
    const shape: Record<string, z.core.$ZodType> = Object.fromEntries(
      order.map((key) => [key, blocks[key] ? blockSchema(blocks[key]) : fields[key]]),
    );
    for (const [key, child] of Object.entries(definition.children ?? {})) {
      shape[key] = z.array(fileSchema(child)).optional();
    }
    return (files[name] = z.strictObject(shape));
  };
  const compiled: Compiled = {
    rows: Object.fromEntries(TABLE_NAMES.map((name) => [name, z.strictObject(tables[name].fields(v))])) as Record<
      TableName,
      z.ZodObject
    >,
    files: Object.fromEntries(TABLE_NAMES.map((name) => [name, fileSchema(name)])) as Record<TableName, z.ZodObject>,
  };
  if (vocabularies) memo.set(vocabularies, compiled);
  else staticCompiled = compiled;
  return compiled;
};
