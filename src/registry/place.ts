/**
 * place: the file under registry/ and the JSON path each loaded row was read from; a row built in code has none.
 * @dev review: src/registry/problem.ts
 */
import { fieldPath, type TableName } from '../schema';
import { keyOf } from './keys';

export interface Place {
  file: string;
  path: string;
}

const places = new WeakMap<object, Place>();

export const place = (row: object, at: Place): void => {
  places.set(row, at);
};

export const joinPath = (path: string, field: string): string =>
  !field ? path : !path || field.startsWith('[') ? `${path}${field}` : `${path}.${field}`;

// A field a check names is found in its file under its block: underlying on an asset is at exposure.underlying.
export const placeOf = (table: TableName, row: object, field = ''): Place => {
  const at = places.get(row);
  if (!at) return { file: `${table}`, path: joinPath(`[${keyOf(table, row)}]`, field) };
  const [, name, rest] = /^([A-Za-z]*)(.*)$/.exec(field)!;
  return { file: at.file, path: joinPath(at.path, name ? `${fieldPath(table, name)}${rest}` : rest) };
};

// A row built in code, such as a derived row, has no file, so the checks of file names and folders skip it.
export const fileOf = (row: object): string | null => places.get(row)?.file ?? null;
