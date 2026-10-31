/**
 * schemaFields: an add command's questions made whole from its table's schema: each field no flag asks becomes a question with no flag, worded by FIELD_QUESTIONS and answered by its schema type's answer; every question is ordered, the required ones first and the optional ones block by block; answersRow lays their answers out as the row.
 * @dev review: src/cli/addCommand.ts, src/cli/schemaAnswers.ts, then src/cli/fieldQuestions.ts
 */
import { blockFields, CHILD_KEYS, tables, type Registry, type TableName } from '../schema';
import type { AnyTableDefinition } from '../schema/defineTable';
import { getAt, setAt } from '../utils/fieldPath';
import { readAnswer } from './answers/answerType';
import { yesNo } from './answers/picks';
import { FIELD_QUESTIONS, type FieldQuestion } from './fieldQuestions';
import { answerOf, isEmpty, optionKey, type Field, type FlagValues } from './questionnaire';
import { leavesOf, schemaShape, VOCABULARY_PROBE, type Leaf } from './schemaAnswers';

// A question of an add command: row names the field it fills when its flag names it otherwise; a question with no flag also carries its path in the row.
export type AddField = Field & {
  row?: string;
  // Asked with the required fields, as an earlier answer a required field hangs on.
  lead?: boolean;
  path?: string[];
  // The field it hangs on, asked right before it.
  follows?: string;
};

const WORDS: Record<string, string> = {
  bps: 'in basis points',
  pct: 'in percent',
  usd: 'in US dollars',
  url: 'link',
  yr: 'year',
  tcs: 'terms and conditions',
};

const wordsOf = (name: string) =>
  name
    .split(/(?=[A-Z])/)
    .map((word) => WORDS[word.toLowerCase()] ?? word.toLowerCase())
    .join(' ');

// A field FIELD_QUESTIONS does not word is asked from its name; a table's own wording, as a market's fees, comes first.
const wordingOf = (table: TableName, leaf: Leaf): FieldQuestion => {
  const path = leaf.path.join('.');
  const known = FIELD_QUESTIONS[`${table}:${path}`] ?? FIELD_QUESTIONS[path];
  if (known) return known;
  const label = wordsOf(leaf.path.at(-1)!);
  return { label, question: leaf.answer.yesNo ? `Does it have ${label}?` : `What is its ${label}?` };
};

const kebab = (path: string[]) =>
  path.map((step) => step.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)).join('-');

const both = (first?: Field['asked'], second?: Field['asked']): Field['asked'] =>
  first && second ? (values) => first(values) && second(values) : (first ?? second);

const questionOf = (table: TableName, leaf: Leaf, gate?: Field['asked']): AddField => {
  const { answer, asked, ...wording } = wordingOf(table, leaf);
  return {
    ...wording,
    flag: `--${kebab(leaf.path)} <value>`,
    description: wording.label,
    answer: typeof answer === 'function' ? answer(table, leaf.path) : (answer ?? leaf.answer),
    asked: both(gate, asked),
    askedOnly: true,
    row: leaf.path[0],
    path: leaf.path,
  };
};

// A block holding more fields than this, as a platform's fee terms, is asked behind one yes or no.
const GATED = 8;

const questionsOf = (table: TableName, field: string): AddField[] => {
  const leaves = leavesOf(table, field);
  if (leaves.length <= GATED) return leaves.map((leaf) => questionOf(table, leaf));
  const key = `${field}Now`;
  const opened = (values: FlagValues) => values[key] === true;
  const gate = questionOf(table, { path: [field], answer: yesNo });
  return [
    { ...gate, flag: `--${kebab([field])}-now <bool>`, path: undefined },
    ...leaves.map((leaf) => questionOf(table, leaf, opened)),
  ];
};

const rowOf = (field: AddField) => field.path?.[0] ?? field.row ?? optionKey(field.flag);

const requiredOf = (field: AddField) =>
  field.lead === true || (typeof field.required === 'function' ? field.required({}) : field.required === true);

// Where a field's optional question sits: its block in the file's order, then a field outside every block in schema order, then the nested lists; a question that follows another sits right after it.
const placeOf = (table: TableName) => {
  const definition = tables[table] as AnyTableDefinition;
  const order = [
    ...Object.keys(definition.blocks ?? {}).flatMap((block) => blockFields(table, block)),
    ...Object.keys(definition.fields(VOCABULARY_PROBE)),
    ...CHILD_KEYS,
  ];
  const at = (field: string) => {
    const index = order.indexOf(field);
    return index === -1 ? order.length : index;
  };
  return (field: AddField) => (field.follows ? at(field.follows) + 0.5 : at(rowOf(field)));
};

export interface SchemaSpec {
  table: TableName;
  // The questions written by hand, with their flags, in dependency order.
  fields: AddField[];
  // The fields the command fills itself and never asks, as the slug from the name.
  derived?: string[];
  // The blocks the file of this kind leaves out, as an issuer's platform block.
  omits?: string[];
}

// Every field the file may hold is asked: the hand-written questions, then one with no flag for each field no question fills; the required ones first in their written order, then the optional ones by their place in the file.
export const schemaFields = ({ table, fields, derived = [], omits = [] }: SchemaSpec): AddField[] => {
  const definition = tables[table] as AnyTableDefinition;
  const covered = new Set(fields.map(rowOf));
  const left = new Set([
    ...covered,
    ...derived,
    ...(definition.build ?? []),
    ...(definition.implied ? [definition.implied] : []),
    ...omits.flatMap((block) => blockFields(table, block)),
  ]);
  const generated = Object.keys(schemaShape(table))
    .filter((field) => !left.has(field))
    .flatMap((field) => questionsOf(table, field));
  const all = [...fields, ...generated];
  const place = placeOf(table);
  const optional = all.filter((field) => !requiredOf(field));
  return [
    ...all.filter(requiredOf),
    ...optional
      .map((field, index) => ({ field, index }))
      .sort((a, b) => place(a.field) - place(b.field) || a.index - b.index)
      .map(({ field }) => field),
  ];
};

// The answers to the questions with no flag, laid out as the row holds them, each read by its answer type.
export const answersRow = (fields: AddField[], values: FlagValues, registry: Registry): Record<string, unknown> => {
  let row: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[optionKey(field.flag)];
    if (!field.path || isEmpty(value)) continue;
    if (field.legs) {
      row = setAt(row, field.path, field.legs.join ? field.legs.join(value as string[]) : value) as Record<
        string,
        unknown
      >;
      continue;
    }
    // Every answer here passed its check on Enter, so it reads to a value.
    const read = readAnswer(answerOf(field), value!, { registry, values });
    if ('value' in read) row = setAt(row, field.path, read.value) as Record<string, unknown>;
  }
  return row;
};

// The value a --from template gives a question, read at its path.
export const templateValue = (field: AddField, template: Record<string, unknown>): unknown =>
  field.path ? getAt(template, field.path) : template[field.row ?? optionKey(field.flag)];
