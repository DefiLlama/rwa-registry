/**
 * templates: the JSON file a person fills for each add command, templates/<name>.json in its file's blocks, and readTemplate, which reads a filled one for --from as a row.
 * @dev review: src/cli/addCommand.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FlagFormatError, LegacyIdError, MissingFieldError } from '../errors/cli';
import { toRow, type TableName } from '../schema';

export interface TemplateSpec {
  table: TableName;
  // The field the file's folder or name supplies, which the template holds first.
  implied?: string;
  // A new row never takes these from a person: the command fills them or leaves them out.
  leftNull?: string[];
  // Left null, the command makes these from another field, such as the slug from the name.
  derived?: string[];
  // The fields the file path or the slug is made from, named as the row names them.
  needs: string[];
  // The blocks the template leaves out, since its kind holds none of their fields.
  omits?: string[];
}

const SPECS = {
  asset: { table: 'asset', implied: 'platform', leftNull: ['slug', 'legacyId'], needs: ['platform', 'symbol'] },
  platform: { table: 'organization', leftNull: ['legacyPid'], derived: ['slug'], needs: ['name'] },
  organization: {
    table: 'organization',
    implied: 'kind',
    leftNull: ['legacyPid'],
    derived: ['slug'],
    needs: ['kind', 'name'],
    omits: ['platform'],
  },
  venue: { table: 'venue', needs: ['slug'] },
  market: { table: 'perp_market', implied: 'venue', leftNull: ['legacyId'], needs: ['venue', 'symbol'] },
  chain: { table: 'chain', derived: ['slug'], needs: ['label'] },
  underlying: { table: 'underlying', implied: 'class', derived: ['slug'], needs: ['class', 'name'] },
  'vocabulary-value': { table: 'vocabulary', implied: 'vocabulary', derived: ['slug'], needs: ['vocabulary', 'label'] },
  'category-rule': { table: 'category_rule', needs: ['structure', 'exposure', 'category'] },
} satisfies Record<string, TemplateSpec>;

export type TemplateName = keyof typeof SPECS;
export const TEMPLATES: Record<TemplateName, TemplateSpec> = SPECS;
export type Template = Record<string, unknown>;

// src/cli and dist/cli both sit two folders below the repository root.
export const templateFile = (name: TemplateName): string => join(__dirname, '../../templates', `${name}.json`);

// A template is written as its file, in named blocks; it is read back as the row, so the commands name fields as the row does.
export const readTemplate = (path: string, spec: TemplateSpec): Template => {
  let template: Template;
  try {
    template = toRow(spec.table, JSON.parse(readFileSync(path, 'utf8')) as Template);
  } catch (error) {
    throw new FlagFormatError({ file: path, message: `cannot read the template: ${(error as Error).message}` });
  }
  return checkTemplate(template, spec, path);
};

// A filled template names what its path needs and leaves the command's keys null; a sheet row keeps the keys it had.
export const checkTemplate = (template: Template, spec: TemplateSpec, file: string, keepKeys = false): Template => {
  const set = keepKeys ? undefined : spec.leftNull?.find((key) => template[key] != null);
  if (set) {
    const message = `${set} is ${String(template[set])}; the command fills it or leaves it out, so leave it null`;
    throw new LegacyIdError({ file, message });
  }
  const missing = spec.needs.find((key) => template[key] == null);
  if (missing) throw new MissingFieldError({ file, message: `${missing} is required` });
  return template;
};
