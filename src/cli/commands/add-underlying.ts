/**
 * add underlying: reference/underlyings/<class>/<slug>.json, one economic exposure keyed on its canonical name, with the asset group it is; the folder is the class that asset group names.
 * @dev review: src/cli/addCommand.ts
 */
import { NoSuchRowError } from '../../errors/cli';
import { homeFile, rowSlug } from '../../registry';
import type { Registry } from '../../schema';
import { defineAddCommand, fileContent } from '../addCommand';
import { vocabulary } from '../answers/picks';

// The file of an underlying: its slug in the folder of the class its asset group names, or null for a group with no class.
const fileOf = (registry: Registry, exposure: unknown, slug: string) => {
  const group = registry.vocabulary.find((row) => row.vocabulary === 'asset-group' && row.slug === exposure);
  return group?.class ? homeFile('underlying', { slug, class: group.class }) : null;
};

export const addUnderlying = defineAddCommand({
  name: 'add underlying',
  description: 'add one underlying file, in the folder of the class its asset group names',
  template: 'underlying',
  fields: [
    {
      flag: '--name <text>',
      description: 'the canonical name, Tesla, Inc.',
      label: 'name',
      question: 'What is the official name of the real-world asset?',
      example: 'Tesla, Inc.',
      required: true,
    },
    {
      flag: '--exposure <slug>',
      description: "the asset group it is, a stablecoin's backing: public-equities",
      label: 'asset group',
      question: 'Which asset group is it, or for a stablecoin, what backs it?',
      required: true,
      answer: vocabulary('asset-group'),
    },
    {
      flag: '--ticker <text>',
      description: 'the ticker, TSLA',
      label: 'ticker',
      question: 'What is its ticker?',
      example: 'TSLA',
    },
  ],
  // The slug comes from the name, the class from the asset group.
  derived: ['slug', 'class'],
  assigned: [
    {
      name: 'file',
      derive: (values, { registry }) =>
        values.name === undefined ? undefined : fileOf(registry, values.exposure, rowSlug(String(values.name))),
    },
  ],
  fromFlags: (values) => ({ name: values.name, ticker: values.ticker, exposure: values.exposure }),
  files: (template, registry) => {
    const slug = String(template.slug ?? rowSlug(String(template.name)));
    const path = fileOf(registry, template.exposure, slug);
    if (!path) {
      const message = `exposure ${String(template.exposure)} is not an asset-group value with a class`;
      throw new NoSuchRowError({ file: 'add underlying', message });
    }
    return [{ path, content: fileContent('underlying', { ...template, slug }) }];
  },
});
