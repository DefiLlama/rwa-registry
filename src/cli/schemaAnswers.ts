/**
 * schemaAnswers: the fields a table's schema lets its file hold, one leaf per key of a nested block such as links or fees, each with the answer type its schema type gives: a date is a day, a vocabulary a pick of its values, a reference a pick of the rows validate lets it name.
 * @dev review: src/cli/schemaFields.ts, src/cli/answers/picks.ts
 */
import { z } from 'zod';
import { REFERENCES } from '../registry/checks/references';
import { tables, type TableName, type VocabularyName } from '../schema';
import type { AnyTableDefinition, VocabularyTypes } from '../schema/defineTable';
import { identifier as identifierType } from '../schema/identifier';
import { date, integer as integerType, protocolId as protocolType, ref, url } from '../schema/primitives';
import { many, type AnswerType } from './answers/answerType';
import { day } from './answers/days';
import { identifier, protocolId } from './answers/ids';
import { link } from './answers/links';
import { amount, integer, number, percent } from './answers/numbers';
import { chain, oneOf, referenceOf, vocabulary, yesNo } from './answers/picks';
import { text } from './answers/text';

interface Def {
  type: string;
  innerType?: Schema;
  element?: Schema;
  shape?: Record<string, Schema>;
  entries?: Record<string, string>;
}
interface Schema {
  def: Def;
}

export interface Leaf {
  path: string[];
  answer: AnswerType;
}

// The vocabulary each field is built from, read back from the schema by identity.
const vocabularies = new Map<unknown, VocabularyName>();
export const VOCABULARY_PROBE = new Proxy({} as VocabularyTypes, {
  get: (_, name: VocabularyName) => {
    const type = z.string();
    vocabularies.set(type, name);
    return type;
  },
});

// A chain is a reference with no table, so it is named here and checked against the chains the sdk and the registry know.
const CHAIN_FIELDS = new Set(['chain', 'chains', 'primaryChain']);

const unwrapped = (schema: Schema): Schema => {
  let at = schema;
  while (at.def.type === 'optional' || at.def.type === 'nullable') at = at.def.innerType!;
  return at;
};

// A number's unit is the last word of its name: fees in basis points and US dollars are zero or more, a Pct field a percent.
const numberAnswer = (field: string): AnswerType => {
  if (/Pct$/.test(field)) return percent;
  return /(Bps|Usd)/.test(field) ? amount : number;
};

const referenceAnswer = (table: TableName, field: string): AnswerType => {
  if (CHAIN_FIELDS.has(field)) return chain;
  return REFERENCES[table]?.some(([name]) => name === field) ? referenceOf(table, field) : text;
};

// The answer type of one schema type; any type no rule names is text.
const answerOfType = (table: TableName, field: string, at: Schema): AnswerType => {
  const type = at as unknown;
  if (type === identifierType) return identifier;
  if (type === protocolType) return protocolId;
  if (type === integerType) return integer;
  if (type === date) return day;
  if (type === url) return link;
  if (type === ref) return referenceAnswer(table, field);
  if (vocabularies.has(type)) return vocabulary(vocabularies.get(type)!);
  if (at.def.type === 'enum') return oneOf(Object.values(at.def.entries!));
  if (at.def.type === 'number') return numberAnswer(field);
  if (at.def.type === 'boolean') return yesNo;
  return text;
};

const leavesAt = (table: TableName, path: string[], schema: Schema): Leaf[] => {
  const at = unwrapped(schema);
  if (at.def.type === 'array') {
    const element = unwrapped(at.def.element!);
    if ((element as unknown) !== identifierType && element.def.type === 'object') return [];
    return leavesAt(table, path, element).map((leaf) => ({ ...leaf, answer: many(leaf.answer) }));
  }
  if ((at as unknown) !== identifierType && at.def.type === 'object')
    return Object.entries(at.def.shape!).flatMap(([key, inner]) => leavesAt(table, [...path, key], inner));
  return [{ path, answer: answerOfType(table, path.at(-1)!, at) }];
};

export const schemaShape = (table: TableName) =>
  (tables[table] as AnyTableDefinition).fields(VOCABULARY_PROBE) as unknown as Record<string, Schema>;

// The leaves of one field of a table: one for a plain field, one per key of a nested block.
export const leavesOf = (table: TableName, field: string): Leaf[] =>
  leavesAt(table, [field], schemaShape(table)[field]!);
