/**
 * add venue: perps/<slug>/venue.json, unpublished until its adapter lands, and its operator beside it.
 * @dev review: src/cli/addCommand.ts
 */
import { homeFile, rowSlug, rwaSlug } from '../../registry';
import { isObject } from '../../utils/isObject';
import { defineAddCommand, fileContent, type FlagValues, type Template } from '../addCommand';
import { chain, referenceOf, vocabulary } from '../answers/picks';
import { slug } from '../answers/text';

// The operator a new venue brings: the template's operator object, or the flags' name under the slug rwaSlug makes when no --organization names one.
const operatorOf = (template: Template, flags: FlagValues): Template | null => {
  if (flags.from !== undefined) return isObject(template.operator) ? template.operator : null;
  return flags.organization === undefined ? { slug: template.organization, name: flags.name } : null;
};

export const addVenue = defineAddCommand({
  name: 'add venue',
  description: 'add one venue file, and its organization when it is new',
  template: 'venue',
  // Never asked: the write sets suspicious and delisted from the file's events.
  derived: ['suspicious', 'delisted'],
  fields: [
    {
      flag: '--name <text>',
      description: 'the venue name, Hibachi',
      label: 'venue name',
      question: 'What is the venue called?',
      example: 'Hibachi',
      required: true,
    },
    {
      flag: '--slug <slug>',
      description: 'the venue folder, the slug of the name by default',
      label: 'slug',
      question: 'Which slug names the venue folder?',
      answer: slug,
      derive: (values) =>
        values.name === undefined ? undefined : { value: rowSlug(String(values.name)), why: 'the slug of the name' },
    },
    {
      flag: '--organization <slug>',
      description: 'the organization that runs it, which must exist; left out, rwaSlug of the name, added when new',
      label: 'operator',
      question: 'Which organization runs the venue?',
      whenEmpty: 'Leave it empty to add a new one under the venue name.',
      answer: referenceOf('venue', 'organization'),
    },
    {
      flag: '--venue-type <slug>',
      description: 'the venue type',
      label: 'venue type',
      question: 'Is the venue a centralized or a decentralized exchange?',
      required: true,
      answer: vocabulary('venue-type'),
    },
    {
      flag: '--access-model <slug>',
      description: 'the access model',
      label: 'access model',
      question: 'Who can trade on the venue?',
      required: true,
      answer: vocabulary('access-model'),
    },
    {
      flag: '--rwa-classification <slug>',
      description: 'the RWA classification',
      label: 'RWA classification',
      question: 'Which RWA classification does the venue fall under?',
      required: true,
      answer: vocabulary('rwa-classification'),
    },
    {
      flag: '--parent <slug>',
      description: 'the parent venue, for a HIP-3 dex',
      label: 'parent venue',
      question: 'Which venue is it part of, for a HIP-3 dex?',
      answer: referenceOf('venue', 'parent'),
    },
    {
      flag: '--chain <slug>',
      description: 'the chain it settles on',
      label: 'settlement chain',
      question: 'Which chain does the venue settle on?',
      answer: chain,
    },
    {
      flag: '--adapter <id>',
      description: 'the adapter id that reads it',
      label: 'adapter id',
      question: 'Which adapter id reads the venue?',
      example: 'hibachi',
    },
    {
      flag: '--published',
      description: 'publish its markets now; off until the adapter is merged',
      label: 'published',
      question: 'Publish its markets now, before its adapter is merged?',
    },
  ],
  fromFlags: (values) => ({
    slug: values.slug ?? (values.name === undefined ? undefined : rowSlug(String(values.name))),
    organization: values.organization ?? (values.name === undefined ? undefined : rwaSlug(String(values.name))),
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
