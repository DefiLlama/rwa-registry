/**
 * moveReferences: one file's JSON with every reference to a row of one table moved to another row, nested rows and role or event targets included; moveReferencesBy moves many rows at once.
 * @dev review: src/registry/checks/references.ts
 */
import { tables, type TableName } from '../schema';
import { isObject } from '../utils/isObject';
import { REFERENCES, TARGETS } from './checks/references';

type Json = Record<string, unknown>;

type Rename = (key: string) => string;

const moveRow = (table: TableName, row: Json, refTable: TableName, rename: Rename): Json => {
  const moved: Json = { ...row };
  for (const [field, target] of REFERENCES[table] ?? []) {
    if (target !== refTable) continue;
    const value = moved[field];
    const renamed = (item: unknown) => (typeof item === 'string' ? rename(item) : item);
    if (typeof value === 'string') moved[field] = rename(value);
    else if (Array.isArray(value) && value.some((item) => renamed(item) !== item)) moved[field] = [...new Set(value.map(renamed))];
  }
  for (const field of Object.keys(TARGETS[table] ?? {})) {
    const target = moved[field];
    if (isObject(target) && target.table === refTable && typeof target.key === 'string' && rename(target.key) !== target.key) {
      moved[field] = { ...target, key: rename(target.key) };
    }
  }
  for (const [key, child] of Object.entries(tables[table].children ?? {}) as [string, TableName][]) {
    const items = moved[key];
    if (Array.isArray(items)) moved[key] = items.map((item) => (isObject(item) ? moveRow(child, item, refTable, rename) : item));
  }
  return moved;
};

export const moveReferencesBy = (table: TableName, file: unknown, refTable: TableName, rename: Rename): unknown =>
  Array.isArray(file)
    ? file.map((row) => (isObject(row) ? moveRow(table, row, refTable, rename) : row))
    : isObject(file)
      ? moveRow(table, file, refTable, rename)
      : file;

export const moveReferences = (table: TableName, file: unknown, refTable: TableName, from: string, to: string): unknown =>
  moveReferencesBy(table, file, refTable, (key) => (key === from ? to : key));
