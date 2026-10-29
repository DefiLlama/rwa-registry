/**
 * fileShape: where each field of a row sits in its file, at the top or one level down in a named block, and the moves between the two shapes.
 * @dev review: src/schema/defineTable.ts
 */
import { z } from 'zod';
import type { AnyTableDefinition, VocabularyTypes } from './defineTable';
import type { TableName } from './enums';
import { isObject } from '../utils/isObject';
import { tables } from './tables';

type Json = Record<string, unknown>;

export interface Place {
  block: string;
  key: string;
}

// The field order only, so every vocabulary reads as a plain string here.
const ANY_VOCABULARY = new Proxy({}, { get: () => z.string() }) as VocabularyTypes;

const placesOf = (definition: AnyTableDefinition): Map<string, Place> => {
  const places = new Map<string, Place>();
  for (const [block, entries] of Object.entries(definition.blocks ?? {})) {
    for (const entry of entries) {
      const [key, field] = typeof entry === 'string' ? [entry, entry] : entry;
      places.set(field, { block, key });
    }
  }
  return places;
};

const memo = new Map<TableName, Map<string, Place>>();
export const placesOfTable = (table: TableName): Map<string, Place> => {
  if (!memo.has(table)) memo.set(table, placesOf(tables[table] as AnyTableDefinition));
  return memo.get(table)!;
};

export const blockNames = (table: TableName): string[] =>
  Object.keys((tables[table] as AnyTableDefinition).blocks ?? {});

// The row fields one block of the table's file holds.
export const blockFields = (table: TableName, block: string): string[] =>
  [...placesOfTable(table)].filter(([, place]) => place.block === block).map(([field]) => field);

// The path of a row field in its file: terms.redeemable for an asset's redeemable, the field itself at the top.
export const fieldPath = (table: TableName, field: string): string => {
  const place = placesOfTable(table).get(field);
  return place ? `${place.block}.${place.key}` : field;
};

// The row field a file path names, its block and key read back; a path outside every block is the field itself.
export const rowField = (table: TableName, path: string): string => {
  const [block, key] = path.split('.');
  if (key === undefined) return block;
  for (const [field, place] of placesOfTable(table)) if (place.block === block && place.key === key) return field;
  return path;
};

// The row a file holds: each block's keys back at the top under their field names, children kept as they are.
export const toRow = (table: TableName, file: Json): Json => {
  const blocks = new Set(blockNames(table));
  const row: Json = {};
  for (const [key, value] of Object.entries(file)) {
    if (!blocks.has(key)) row[key] = value;
    else if (isObject(value))
      for (const [inner, item] of Object.entries(value)) row[rowField(table, `${key}.${inner}`)] = item;
  }
  return row;
};

// The file a row is written as: fields in schema order, a block where its first field falls, children last; the field its folder supplies, the build fields and an empty block are left out.
export const toFile = (table: TableName, row: Json): Json => {
  const definition = tables[table] as AnyTableDefinition;
  const places = placesOfTable(table);
  const children = new Set(Object.keys(definition.children ?? {}));
  const left = new Set([definition.implied, ...(definition.build ?? [])]);
  const file: Json = {};
  const fields = [...Object.keys(definition.fields(ANY_VOCABULARY)), ...Object.keys(row)];
  for (const field of new Set(fields)) {
    if (children.has(field) || left.has(field) || row[field] === undefined) continue;
    const place = places.get(field);
    if (!place) file[field] = row[field];
    else ((file[place.block] ??= {}) as Json)[place.key] = row[field];
  }
  for (const [block, entries] of Object.entries(definition.blocks ?? {})) {
    if (!isObject(file[block])) continue;
    const keys = entries.map((entry) => (typeof entry === 'string' ? entry : entry[0]));
    const inner = file[block] as Json;
    file[block] = Object.fromEntries(keys.filter((key) => key in inner).map((key) => [key, inner[key]]));
  }
  for (const child of children) if (row[child] !== undefined) file[child] = row[child];
  return file;
};

// A file in its schema's order, nested rows too, so a field set where the file had none sits where add puts it.
export const inSchemaOrder = (table: TableName, json: unknown): unknown => {
  if (!isObject(json)) return json;
  const row = toRow(table, json);
  for (const [key, child] of Object.entries(tables[table].children ?? {}) as [string, TableName][]) {
    const items = row[key];
    if (Array.isArray(items)) row[key] = items.map((item: unknown) => inSchemaOrder(child, item));
  }
  return toFile(table, row);
};
