/**
 * add venue: perps/<slug>/venue.json, unpublished until its adapter lands, and its operator beside it, perps/<slug>/organization.json, when the flags leave it out and none exists.
 * @dev review: src/cli/addCommand.ts
 */
import { homeFile, rowSlug, rwaSlug } from '../../registry';
import { defineAddCommand, fileContent, vocabularyChoices } from '../addCommand';

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
  files: (template, registry, { flags, sheet }) => {
    const venue = {
      path: homeFile('venue', template),
      content: fileContent('venue', { ...template, published: template.published ?? false }),
    };
    const organization = String(template.organization);
    // A sheet venue brings its operator whole, written beside it when the registry lacks it.
    if (sheet) {
      const operator = sheet.operator;
      if (!operator || registry.organization.some((row) => row.slug === organization)) return [venue];
      const owner = { ...operator, kind: 'venue-operator', venue: template.slug };
      const { kind: _, venue: __, ...content } = owner;
      return [venue, { path: homeFile('organization', owner), content: fileContent('organization', content) }];
    }
    const named = flags.from !== undefined || flags.organization !== undefined;
    if (named || registry.organization.some((row) => row.slug === organization)) return [venue];
    const owner = { slug: organization, name: flags.name, kind: 'venue-operator', venue: template.slug };
    return [
      venue,
      {
        path: homeFile('organization', owner),
        content: fileContent('organization', { slug: organization, name: flags.name }),
      },
    ];
  },
});
