/**
 * defineTable: one table's fields, the field its file or folder supplies, the fields the build computes, its nested child tables and the named blocks its file groups fields into.
 * @dev review: src/schema/fileShape.ts
 */
import { z } from 'zod';
import type { TableName, VocabularyName } from './enums';

export type VocabularyTypes = Record<VocabularyName, z.ZodType<string>>;

export const CHILD_KEYS = ['deployments', 'labels', 'roles', 'events'] as const;
export type ChildKey = (typeof CHILD_KEYS)[number];

// A block entry is a field, or [the key the file writes, the field] where the file names it another way.
export type BlockEntry<F extends string = string> = F | readonly [string, F];

export interface TableDefinition<S extends z.ZodRawShape = z.ZodRawShape> {
  fields: (v: VocabularyTypes) => S;
  implied?: keyof S & string;
  build?: (keyof S & string)[];
  children?: Partial<Record<ChildKey, TableName>>;
  blocks?: Record<string, readonly BlockEntry<keyof S & string>[]>;
}

export interface AnyTableDefinition {
  fields: (v: VocabularyTypes) => z.ZodRawShape;
  implied?: string;
  build?: readonly string[];
  children?: Partial<Record<ChildKey, TableName>>;
  blocks?: Record<string, readonly BlockEntry[]>;
}

export const defineTable = <S extends z.ZodRawShape>(definition: TableDefinition<S>) => definition;
