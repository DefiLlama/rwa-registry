/**
 * fieldValue: a flag's text parsed by the schema type of one field path in a table's file.
 * @dev review: src/cli/commands/set.ts
 */
import { FlagFormatError } from '../errors/cli';
import { compileSchemas } from '../schema/compileSchemas';
import { fieldPath, tables, type TableName } from '../schema';
import { stepsOf, type Step } from '../utils/fieldPath';
import { commaList } from './commaList';
interface Def {
  type: string;
  innerType?: Schema;
  element?: Schema;
  shape?: Record<string, Schema>;
}
interface Schema {
  def: Def;
}

// The value set accepts for null.
const UNKNOWN = 'unknown';

export const parseJson = (text: string, file: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new FlagFormatError({ file, message: `is not valid JSON: ${(cause as Error).message}`, cause });
  }
};

// The type at a path, unwrapping optional and nullable; null when the path names no field.
const typeAt = (schema: Schema, steps: Step[]): { def: Def; nullable: boolean } | null => {
  let at = schema;
  let nullable = false;
  for (let i = 0; ; i++) {
    while (at.def.type === 'optional' || at.def.type === 'nullable') {
      nullable = true;
      at = at.def.innerType!;
    }
    if (i === steps.length) return { def: at.def, nullable };
    const step = steps[i]!;
    const next = typeof step === 'number' ? at.def.element : at.def.shape?.[step];
    if (!next) return null;
    at = next;
    nullable = false;
  }
};

const fileSchemaOf = (table: TableName): Schema => {
  const row = compileSchemas(tables, null).files[table] as unknown as Schema;
  return table === 'vocabulary' || table === 'category_rule' ? { def: { type: 'array', element: row } } : row;
};

const scalar = (type: string, text: string, path: string): unknown => {
  if (type === 'number') {
    const value = Number(text);
    if (text.trim() === '' || Number.isNaN(value))
      throw new FlagFormatError({ file: path, message: `${text} is not a number` });
    return value;
  }
  if (type === 'boolean') {
    if (text !== 'true' && text !== 'false') {
      throw new FlagFormatError({ file: path, message: `${text} is not true, false or ${UNKNOWN}` });
    }
    return text === 'true';
  }
  return text;
};

export const parseFieldValue = (table: TableName, path: string, text: string): unknown => {
  const found = typeAt(fileSchemaOf(table), stepsOf(path));
  if (!found) {
    const [first] = stepsOf(path);
    const inBlock = typeof first === 'string' && fieldPath(table, first) !== first ? fieldPath(table, first) : null;
    const message = inBlock
      ? `${path} is at ${inBlock} in ${table === 'asset' ? 'an' : 'a'} ${table} file`
      : `${path} is not a field of ${table}`;
    throw new FlagFormatError({ file: path, message });
  }
  if (text === UNKNOWN) {
    if (!found.nullable)
      throw new FlagFormatError({ file: path, message: `${path} is required, so it cannot be ${UNKNOWN}` });
    return null;
  }
  const { def } = found;
  if (def.type === 'array') {
    const items = text.trim().startsWith('[') ? (parseJson(text, path) as unknown[]) : commaList(text);
    // A list of rows, such as roles or identifiers, is kept as parsed, and the schema checks each row.
    const element = def.element!.def.type;
    if (element === 'object' || element === 'array') return items;
    return items.map((item) => scalar(element, String(item), path));
  }
  if (def.type === 'object') return parseJson(text, path);
  return scalar(def.type, text, path);
};
