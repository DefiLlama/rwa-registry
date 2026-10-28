/**
 * Problem: one finding of the loader or a check, an error that fails validate or a warning it prints.
 * @dev review: src/registry/place.ts
 */
import type { RegistryError, SchemaError } from '../errors';
import type { TableName } from '../schema';
import { placeOf } from './place';

export type Severity = 'error' | 'warning';

export interface Problem {
  file: string;
  path: string;
  message: string;
  error: string;
  severity: Severity;
}

// One finding named across loads, so a known problem is told from a new one.
export const problemId = (problem: Problem): string => `${problem.file}|${problem.path}|${problem.message}`;

export const toProblem = (error: SchemaError | RegistryError, severity: Severity = 'error'): Problem => ({
  file: error.file,
  path: error.path,
  message: error.message,
  error: error.name,
  severity,
});

export const report = (
  ErrorClass: new (at: { file: string; path: string; message: string }) => RegistryError,
  table: TableName,
  row: object,
  field: string,
  message: string,
  severity: Severity = 'error',
): Problem => toProblem(new ErrorClass({ ...placeOf(table, row, field), message }), severity);
