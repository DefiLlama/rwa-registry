/**
 * add value: one value in one vocabulary file, slug rwaSlug(label), the file kept sorted by slug.
 * @dev review: src/cli/addCommand.ts
 */
import { homeFile, rwaSlug } from '../../registry';
import { VOCABULARY_NAMES } from '../../schema';
import { defineAddCommand, fileContent } from '../addCommand';

export const addValue = defineAddCommand({
  name: 'add value',
  description: 'add one value to a vocabulary file',
  template: 'vocabulary-value',
  fields: [
    {
      flag: '--vocabulary <name>',
      description: 'the vocabulary file',
      required: true,
      choices: () => [...VOCABULARY_NAMES],
    },
    { flag: '--label <text>', description: 'the label the app shows, Stock Backed', required: true },
    { flag: '--slug <slug>', description: 'the slug, rwaSlug of the label by default' },
    { flag: '--description <text>', description: 'one sentence on what the value means' },
  ],
  fromFlags: (values) => ({
    vocabulary: values.vocabulary,
    slug: values.slug,
    label: values.label,
    description: values.description,
  }),
  files: ({ vocabulary, ...value }, registry) => {
    const slug = String(value.slug ?? rwaSlug(String(value.label)));
    const rows = registry.vocabulary
      .filter((row) => row.vocabulary === vocabulary)
      .map(({ vocabulary: _, ...row }) => row);
    const content = [...rows, fileContent('vocabulary', { ...value, slug })].sort((a, b) =>
      String(a.slug) < String(b.slug) ? -1 : 1,
    );
    const conflict = rows.some((row) => row.slug === slug) ? `${slug} is already in ${vocabulary}` : undefined;
    return [{ path: homeFile('vocabulary', { vocabulary }), content, replaces: true, conflict }];
  },
});
