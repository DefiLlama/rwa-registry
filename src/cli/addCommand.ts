/**
 * defineAddCommand: an add command turns its flags, or a filled template given with --from, into one row and writes its files from it; fileContent lays a row out in its file's blocks.
 * @dev review: src/cli/writeCommand.ts, src/cli/templates.ts, then src/cli/commands/add-asset.ts
 */
import { FlagFormatError } from '../errors/cli';
import { tables, toFile, type ChildKey, type Registry, type TableName, type VocabularyName } from '../schema';
import { isObject } from '../utils/isObject';
import type { CliCommand } from './index';
import { readTemplate, TEMPLATES, type Template, type TemplateName } from './templates';
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

export interface AddContext extends WriteContext {
  flags: FlagValues;
}

export interface AddSpec {
  name: string;
  description: string;
  template: TemplateName;
  fields: Field[];
  fromFlags: (values: FlagValues) => Template;
  files: (template: Template, registry: Registry, context: AddContext) => FileToWrite[] | Promise<FileToWrite[]>;
}

export const vocabularyChoices = (name: VocabularyName) => (registry: Registry) =>
  registry.vocabulary.filter((row) => row.vocabulary === name).map((row) => row.slug);

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

const unlessFrom = (field: Field): Field => ({
  ...field,
  required: (values) =>
    values.from === undefined &&
    (typeof field.required === 'function' ? field.required(values) : field.required === true),
});

export const defineAddCommand = (spec: AddSpec): CliCommand =>
  defineWriteCommand({
    name: spec.name,
    description: spec.description,
    fields: [
      { flag: '--from <file>', description: `a filled copy of templates/${spec.template}.json, in place of the flags` },
      ...spec.fields.map(unlessFrom),
    ],
    files: (values, registry, context) => {
      if (values.from === undefined) return spec.files(spec.fromFlags(values), registry, { ...context, flags: values });
      const beside = spec.fields
        .map((field) => field.flag.split(' ')[0]!)
        .filter((flag) => !flag.startsWith('--no-') && values[optionKey(flag)] !== undefined);
      if (beside.length) {
        const message = `${beside.join(', ')} ${beside.length > 1 ? 'are' : 'is'} given beside --from; put it in the file`;
        throw new FlagFormatError({ file: spec.name, message });
      }
      const template = readTemplate(String(values.from), TEMPLATES[spec.template]);
      return spec.files(template, registry, { ...context, flags: values });
    },
  });
