/**
 * templates: the JSON file a person fills for each add command, templates/<name>.json in its file's blocks, and readTemplate, which reads a filled one for --from as a row.
 * @dev review: src/cli/addCommand.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FlagFormatError, MissingFieldError } from '../errors/cli';
import { toRow, type TableName } from '../schema';
import { isObject } from '../utils/isObject';
import { isEmpty } from './questionnaire';

export interface TemplateSpec {
  table: TableName;
  // The field the file's folder or name supplies, which the template holds first.
  implied?: string;
  // Left null, the command assigns these: the slug from the name, label or canonical market id, an asset's next legacy id.
  assigned?: string[];
  // A second row the template may carry for a file written beside its own: a venue's operator.
  beside?: string;
  // The fields the file path or the slug is made from, named as the row names them.
  needs: string[];
  // The blocks the template leaves out, since its kind holds none of their fields.
  omits?: string[];
}

const SPECS = {
  asset: { table: 'asset', implied: 'platform', assigned: ['slug', 'legacyId'], needs: ['platform', 'symbol'] },
  platform: { table: 'organization', assigned: ['slug'], needs: ['name'] },
  organization: {
    table: 'organization',
    implied: 'kind',
    assigned: ['slug'],
    needs: ['kind', 'name'],
    omits: ['platform', 'review'],
  },
  venue: { table: 'venue', beside: 'operator', needs: ['slug'] },
  market: { table: 'perp_market', implied: 'venue', needs: ['venue', 'symbol'] },
  underlying: { table: 'underlying', assigned: ['slug'], needs: ['name', 'exposure'] },
  'vocabulary-value': {
    table: 'vocabulary',
    implied: 'vocabulary',
    assigned: ['slug'],
    needs: ['vocabulary', 'label'],
  },
} satisfies Record<string, TemplateSpec>;

export type TemplateName = keyof typeof SPECS;
export const TEMPLATES: Record<TemplateName, TemplateSpec> = SPECS;
export type Template = Record<string, unknown>;

// src/cli and dist/cli both sit two folders below the repository root.
export const templateFile = (name: TemplateName): string => join(__dirname, '../../templates', `${name}.json`);

// A template is written as its file, in named blocks; it is read back as the row, so the commands name fields as the row does.
export const templateRow = (path: string, spec: TemplateSpec): Template => {
  try {
    return toRow(spec.table, JSON.parse(readFileSync(path, 'utf8')) as Template);
  } catch (error) {
    throw new FlagFormatError({ file: path, message: `cannot read the template: ${(error as Error).message}` });
  }
};

// The answers fill what the written row leaves blank, a block such as links key by key.
const filled = (written: Template, answers: Template): Template => {
  const template = { ...written };
  for (const [key, value] of Object.entries(answers)) {
    if (value === undefined) continue;
    if (isEmpty(written[key])) template[key] = value;
    else if (isObject(written[key]) && isObject(value)) template[key] = filled(written[key], value);
  }
  return template;
};

// The answers fill what the template leaves blank; it names what its path needs, and a key it leaves null, the command assigns.
export const readTemplate = (path: string, spec: TemplateSpec, answers: Template = {}): Template => {
  const template = filled(templateRow(path, spec), answers);
  const missing = spec.needs.find((key) => template[key] == null);
  if (missing) throw new MissingFieldError({ file: path, message: `${missing} is required` });
  return template;
};
