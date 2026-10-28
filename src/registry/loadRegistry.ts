/**
 * loadRegistry: every file under registry/ parsed by its table schema, nested rows flattened, then every check run.
 * @dev review: src/registry/layout.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SchemaError, UnknownPathError } from '../errors';
import {
  CHILD_KEYS,
  parseRow,
  TABLE_NAMES,
  tables,
  toRow,
  VOCABULARY_NAMES,
  type Registry,
  type TableName,
  type Vocabularies,
  type VocabularyName,
} from '../schema';
import { isObject } from '../utils/isObject';
import { checkRegistry } from './checks';
import { keyOf, type AnyRow } from './keys';
import { ACKS_DIR, homeOf } from './layout';
import { toProblem, type Problem } from './problem';
import { fileOf, joinPath, place } from './place';

const listFiles = (root: string): string[] =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();

const listAcks = (root: string): string[] =>
  existsSync(join(root, ACKS_DIR)) ? listFiles(join(root, ACKS_DIR)).map((file) => `${ACKS_DIR}/${file}`) : [];

const flatten = (registry: Registry, table: TableName, written: AnyRow, link: unknown, at: { file: string; path: string }) => {
  const definition = tables[table];
  const row: AnyRow = toRow(table, written);
  for (const key of CHILD_KEYS) delete row[key];
  if (definition.implied) row[definition.implied] = link;
  (registry[table] as AnyRow[]).push(row);
  place(row, at);
  for (const [key, child] of Object.entries(definition.children ?? {}) as [string, TableName][]) {
    const items = written[key];
    if (!Array.isArray(items)) continue;
    const childLink = tables[child].implied === 'target' ? { table, key: keyOf(table, row) } : keyOf(table, row);
    items.forEach((item, i) => {
      if (isObject(item)) flatten(registry, child, item, childLink, { file: at.file, path: joinPath(at.path, `${key}[${i}]`) });
    });
  }
};

const readJson = (root: string, file: string, problems: Problem[]): unknown => {
  try {
    return JSON.parse(readFileSync(join(root, file), 'utf8'));
  } catch (cause) {
    problems.push(toProblem(new SchemaError({ file, path: '', message: `not valid JSON: ${(cause as Error).message}` })));
    return undefined;
  }
};

// One vocabulary file's values flattened into the registry, with the problems of its shape and rows.
export const loadVocabularyFile = (registry: Registry, file: string, json: unknown): Problem[] => {
  const problems: Problem[] = [];
  const name = homeOf(file)!.implied as VocabularyName;
  if (!VOCABULARY_NAMES.includes(name)) {
    return [toProblem(new UnknownPathError({ file, path: '', message: `${name} is not a vocabulary` }))];
  }
  if (!Array.isArray(json)) {
    return [toProblem(new SchemaError({ file, path: '', message: 'a vocabulary file holds an array of values' }))];
  }
  json.forEach((value, i) => {
    const parsed = parseRow('vocabulary', value, file, { path: `[${i}]` });
    if (Array.isArray(parsed)) problems.push(...parsed.map((error) => toProblem(error)));
    if (isObject(value)) flatten(registry, 'vocabulary', value, name, { file, path: `[${i}]` });
  });
  return problems;
};

// The slugs of every vocabulary the registry holds, which the other files' vocabulary fields are parsed against.
export const vocabulariesOf = (registry: Registry): Vocabularies => {
  const vocabularies: Partial<Record<VocabularyName, string[]>> = {};
  for (const row of registry.vocabulary) {
    const name = row.vocabulary as VocabularyName;
    if (VOCABULARY_NAMES.includes(name)) (vocabularies[name] ??= []).push(String(row.slug));
  }
  return vocabularies;
};

// One file other than a vocabulary flattened into the registry, with the problems of its path and rows.
export const loadFile = (registry: Registry, file: string, json: unknown, vocabularies: Vocabularies): Problem[] => {
  const home = homeOf(file);
  if (!home) {
    const message = `${file} is not a file the registry tree holds: reference/, assets/ or perps/, and acks/ beside registry/`;
    return [toProblem(new UnknownPathError({ file, path: '', message }))];
  }
  if (home.many && !Array.isArray(json)) {
    return [toProblem(new SchemaError({ file, path: '', message: `${file} holds an array of rows` }))];
  }
  const problems: Problem[] = [];
  const rows = home.many ? (json as unknown[]).map((row, i) => ({ row, path: `[${i}]` })) : [{ row: json, path: '' }];
  for (const { row, path } of rows) {
    const parsed = parseRow(home.table, row, file, { vocabularies, path });
    if (Array.isArray(parsed)) problems.push(...parsed.map((error) => toProblem(error)));
    // A row that fails its schema is still loaded as written, so the checks report each bad value once.
    if (isObject(row)) flatten(registry, home.table, row, home.implied, { file, path });
  }
  return problems;
};

// The rows one file holds taken out of the registry, so the file can be loaded again with new content.
export const dropFile = (registry: Registry, file: string): void => {
  for (const table of TABLE_NAMES) {
    const rows = registry[table] as AnyRow[];
    if (rows.some((row) => fileOf(row) === file))
      (registry as unknown as Record<TableName, AnyRow[]>)[table] = rows.filter((row) => fileOf(row) !== file);
  }
};

export const isVocabularyFile = (file: string): boolean => homeOf(file)?.table === 'vocabulary';

// Every file of the registry folder and of the acks beside it, as paths from the registry folder, in name order.
export const registryFiles = (root: string): string[] => [...listFiles(root), ...listAcks(root)];

export const emptyRegistry = (): Registry =>
  Object.fromEntries(TABLE_NAMES.map((table) => [table, []])) as unknown as Registry;

export const loadRegistry = (root: string, base: Registry | null = null): { registry: Registry; problems: Problem[] } => {
  const registry = emptyRegistry();
  const problems: Problem[] = [];
  const files = registryFiles(root);
  const read = (file: string) => readJson(root, file, problems);
  for (const file of files.filter(isVocabularyFile)) {
    const json = read(file);
    if (json !== undefined) problems.push(...loadVocabularyFile(registry, file, json));
  }
  const vocabularies = vocabulariesOf(registry);
  for (const file of files.filter((file) => !isVocabularyFile(file))) {
    const json = homeOf(file) ? read(file) : null;
    if (json !== undefined) problems.push(...loadFile(registry, file, json, vocabularies));
  }
  problems.push(...checkRegistry(registry, base));
  return { registry, problems };
};
