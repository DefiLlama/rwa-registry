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
      label: 'list',
      question: 'Which list of values does it go in?',
      required: true,
      choices: () => [...VOCABULARY_NAMES],
    },
    {
      flag: '--label <text>',
      description: 'the label the app shows, Stock Backed',
      label: 'label',
      question: 'Which label does the app show for it?',
      example: 'Stock Backed',
      required: true,
    },
    {
      flag: '--slug <slug>',
      description: 'the slug, rwaSlug of the label by default',
      label: 'slug',
      question: 'Which slug do the registry files use for it?',
      derive: (values) =>
        values.label === undefined ? undefined : { value: rwaSlug(String(values.label)), why: 'the slug of the label' },
    },
    {
      flag: '--class <slug>',
      description: 'the underlying class folder of an asset-group value',
      label: 'underlying class',
      question: 'Which underlying class folder holds this asset group?',
      example: 'equity',
      askedOnly: true,
      asked: (values) => values.vocabulary === 'asset-group',
    },
  ],
  fromFlags: (values) => ({
    vocabulary: values.vocabulary,
    slug: values.slug,
    label: values.label,
    class: values.class,
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
