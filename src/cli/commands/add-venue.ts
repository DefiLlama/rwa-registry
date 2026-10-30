/**
 * add venue: perps/<slug>/venue.json, unpublished until its adapter lands, and its operator beside it.
 * @dev review: src/cli/addCommand.ts
 */
import { homeFile, rowSlug, rwaSlug } from '../../registry';
import { isObject } from '../../utils/isObject';
import { defineAddCommand, fileContent, vocabularyChoices, type FlagValues, type Template } from '../addCommand';

// The operator a new venue brings: the template's operator object, or the flags' name under the slug rwaSlug makes when no --organization names one.
const operatorOf = (template: Template, flags: FlagValues): Template | null => {
  if (flags.from !== undefined) return isObject(template.operator) ? template.operator : null;
  return flags.organization === undefined ? { slug: template.organization, name: flags.name } : null;
};

export const addVenue = defineAddCommand({
  name: 'add venue',
  description: 'add one venue file, and its organization when it is new',
  template: 'venue',
  fields: [
    { flag: '--name <text>', description: 'the venue name, Hibachi', required: true },
    { flag: '--slug <slug>', description: 'the venue folder, the slug of the name by default' },
    {
      flag: '--organization <slug>',
      description: 'the organization that runs it, which must exist; left out, rwaSlug of the name, added when new',
    },
    {
      flag: '--venue-type <slug>',
      description: 'the venue type',
      required: true,
      choices: vocabularyChoices('venue-type'),
    },
    {
      flag: '--access-model <slug>',
      description: 'the access model',
      required: true,
      choices: vocabularyChoices('access-model'),
    },
    {
      flag: '--rwa-classification <slug>',
      description: 'the RWA classification',
      required: true,
      choices: vocabularyChoices('rwa-classification'),
    },
    { flag: '--parent <slug>', description: 'the parent venue, for a HIP-3 dex' },
    { flag: '--chain <slug>', description: 'the chain it settles on' },
    { flag: '--adapter <id>', description: 'the adapter id that reads it' },
    { flag: '--published', description: 'publish its markets now; off until the adapter is merged' },
  ],
  fromFlags: (values) => ({
    slug: values.slug ?? rowSlug(String(values.name)),
    organization: values.organization ?? rwaSlug(String(values.name)),
    parent: values.parent,
    venueType: values.venueType,
    chain: values.chain,
    adapter: values.adapter,
    published: values.published === true,
    accessModel: values.accessModel,
    rwaClassification: values.rwaClassification,
  }),
  files: (template, registry, { flags }) => {
    const { operator: _, ...row } = template;
    const venue = {
      path: homeFile('venue', row),
      content: fileContent('venue', { ...row, published: row.published ?? false }),
    };
    const operator = operatorOf(template, flags);
    if (!operator || registry.organization.some((item) => item.slug === operator.slug)) return [venue];
    const home = { ...operator, kind: 'venue-operator', venue: row.slug };
    return [venue, { path: homeFile('organization', home), content: fileContent('organization', operator) }];
  },
});
