/**
 * defineAddCommand: an add command turns its flags, or a filled template given with --from, into one row and writes its files from it; fileContent lays a row out in its file's blocks.
 * @dev review: src/cli/writeCommand.ts, src/cli/templates.ts, then src/cli/commands/add-asset.ts
 */
import { FlagFormatError } from '../errors/cli';
import {
  inSchemaOrder,
  tables,
  toFile,
  type ChildKey,
  type Registry,
  type TableName,
  type VocabularyName,
} from '../schema';
import { isObject } from '../utils/isObject';
import type { CliCommand } from './index';
import { isEmpty, type Assigned } from './questionnaire';
import { answersRow, schemaFields, templateValue, type AddField } from './schemaFields';
import { readTemplate, templateRow, TEMPLATES, type Template, type TemplateName } from './templates';
import {
  defineWriteCommand,
  optionKey,
  type Field,
  type FileToWrite,
  type FlagValues,
  type WriteContext,
} from './writeCommand';

export type { Field, FileToWrite, FlagValue, FlagValues } from './writeCommand';
export type { Template } from './templates';
export type { AddField } from './schemaFields';

export interface AddContext extends WriteContext {
  flags: FlagValues;
}

export interface AddSpec {
  name: string;
  description: string;
  template: TemplateName;
  // The questions with flags, a field after the fields it derives from or refers to; the schema's other fields are asked after them with no flag.
  fields: AddField[];
  // The fields the command fills itself and never asks, as the slug it makes from the name.
  derived?: string[];
  assigned?: Assigned[];
  fromFlags: (values: FlagValues) => Template;
  files: (template: Template, registry: Registry, context: AddContext) => FileToWrite[] | Promise<FileToWrite[]>;
}

// The values of one vocabulary, shown by their label and answered by their slug.
export const vocabularyChoices = (name: VocabularyName) => (registry: Registry) =>
  registry.vocabulary
    .filter((row) => row.vocabulary === name)
    .map((row) => ({ value: row.slug, name: row.label ?? row.slug }));

// The organizations a role may name, shown by name in the prompt.
export const organizationChoices = (registry: Registry) =>
  registry.organization
    .map((row) => ({ value: row.slug, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

const present = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.length ? value : undefined;
  if (!isObject(value)) return value ?? undefined;
  const kept = Object.entries(value).flatMap(([key, inner]) => {
    const shown = present(inner);
    return shown === undefined ? [] : [[key, shown]];
  });
  return kept.length ? Object.fromEntries(kept) : undefined;
};

// A row as its file holds it: its blocks in the schema's order, nulls, empty lists and empty blocks left out; a key the schema lacks stays, at the top, for the checks to name.
export const fileContent = (table: TableName, row: Record<string, unknown>): Record<string, unknown> => {
  const children: Partial<Record<string, TableName>> = tables[table].children ?? {};
  const nested = Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const child = children[key as ChildKey];
      if (!child || !Array.isArray(value)) return [key, value];
      return [key, value.map((item: unknown) => (isObject(item) ? fileContent(child, item) : item))];
    }),
  );
  return (present(toFile(table, nested)) ?? {}) as Record<string, unknown>;
};

const unlessFrom = (field: AddField): AddField => ({
  ...field,
  required: (values) =>
    values.from === undefined &&
    (typeof field.required === 'function' ? field.required(values) : field.required === true),
});

const flagName = (field: Field) => field.flag.split(' ')[0]!;

// A flag beside --from is refused, so a field comes from one place; the template's fields skip their questions.
const templateGiven = (spec: AddSpec, fields: AddField[], options: FlagValues): Record<string, unknown> => {
  if (options.from === undefined) return {};
  const beside = fields
    .filter((field) => !field.askedOnly)
    .map(flagName)
    .filter((flag) => !flag.startsWith('--no-') && options[optionKey(flag)] !== undefined);
  if (beside.length) {
    const message = `${beside.join(', ')} ${beside.length > 1 ? 'are' : 'is'} given beside --from; put it in the file`;
    throw new FlagFormatError({ file: spec.name, message });
  }
  const template = templateRow(String(options.from), TEMPLATES[spec.template]);
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = templateValue(field, template);
      return isEmpty(value) ? [] : [[optionKey(field.flag), value]];
    }),
  );
};

const merged = (into: Record<string, unknown>, from: Record<string, unknown>): Record<string, unknown> => {
  const row = { ...into };
  for (const [key, value] of Object.entries(from))
    row[key] = isObject(row[key]) && isObject(value) ? merged(row[key], value) : value;
  return row;
};

const HELP =
  "In a terminal it asks every field of the file no flag or --from file gives: the required ones first, then the optional ones block by block, the file's fields with no flag among them; then it lists them all for a yes or no; --no-input and --json never ask.";

export const defineAddCommand = (spec: AddSpec): CliCommand => {
  const { table, omits } = TEMPLATES[spec.template] as { table: TableName; omits?: string[] };
  const fields = schemaFields({ table, fields: spec.fields, derived: spec.derived, omits });
  // The flags' row with the answers to the questions with no flag laid in.
  const rowOf = (values: FlagValues) => merged(spec.fromFlags(values), answersRow(fields, values));
  return {
    ...defineWriteCommand({
      name: spec.name,
      description: spec.description,
      every: true,
      assigned: spec.assigned,
      fields: [
        {
          flag: '--from <file>',
          description: `a filled copy of templates/${spec.template}.json; the fields it leaves empty are asked`,
          label: 'template file',
          asked: () => false,
        },
        ...fields.map(unlessFrom),
      ],
      given: (options) => templateGiven(spec, fields, options),
      files: (values, registry, context) => {
        const addContext = { ...context, flags: values };
        const template =
          values.from === undefined
            ? rowOf(values)
            : readTemplate(String(values.from), TEMPLATES[spec.template], rowOf(values));
        return spec.files(template, registry, addContext);
      },
    }),
    help: HELP,
  };
};
