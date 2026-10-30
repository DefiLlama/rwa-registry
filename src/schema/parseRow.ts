/**
 * parseRow: one row checked as its file holds it, where an unknown key fails and a vocabulary miss names the nearest value.
 * @dev review: src/registry/loadRegistry.ts
 */
import type { z } from 'zod';
import { SchemaError } from '../errors';
import { compileSchemas, type Vocabularies } from './compileSchemas';
import type { TableName } from './enums';
import { tables, type FileRow } from './index';

export interface ParseOptions {
  vocabularies?: Vocabularies;
  path?: string;
}

const formatPath = (prefix: string, path: PropertyKey[]): string =>
  path.reduce<string>(
    (at, key) => (typeof key === 'number' ? `${at}[${key}]` : at ? `${at}.${String(key)}` : String(key)),
    prefix,
  );

const distance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
};

const nearest = (input: string, values: string[]): string =>
  values.reduce((best, value) => (distance(input, value) < distance(input, best) ? value : best));

const errorsOf = (issue: z.core.$ZodIssue, file: string, prefix: string): SchemaError[] => {
  const path = formatPath(prefix, issue.path);
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => {
      const at = formatPath(path, [key]);
      return new SchemaError({ file, path: at, message: `${at} is not a field here` });
    });
  }
  if (issue.input == null) {
    return [new SchemaError({ file, path, message: `${path} is required` })];
  }
  if (issue.code === 'invalid_value') {
    const values = issue.values.map(String);
    const message = `${path}: ${issue.message}, did you mean ${nearest(String(issue.input), values)}`;
    return [new SchemaError({ file, path, message })];
  }
  return [new SchemaError({ file, path, message: `${path}: ${issue.message}` })];
};

export const parseRow = <T extends TableName>(
  table: T,
  json: unknown,
  file: string,
  options: ParseOptions = {},
): FileRow<T> | SchemaError[] => {
  const schema = compileSchemas(tables, options.vocabularies ?? null).files[table];
  const result = schema.safeParse(json, { reportInput: true });
  if (result.success) return result.data as FileRow<T>;
  return result.error.issues.flatMap((issue) => errorsOf(issue, file, options.path ?? ''));
};
