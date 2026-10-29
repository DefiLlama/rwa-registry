/**
 * add underlying: reference/underlyings/<class>/<slug>.json, one economic exposure keyed on its canonical name, with the asset group it is; the folder is the class that asset group names.
 * @dev review: src/cli/addCommand.ts
 */
import { NoSuchRowError } from '../../errors/cli';
import { homeFile, rowSlug } from '../../registry';
import { defineAddCommand, fileContent, vocabularyChoices } from '../addCommand';

export const addUnderlying = defineAddCommand({
  name: 'add underlying',
  description: 'add one underlying file, in the folder of the class its asset group names',
  template: 'underlying',
  fields: [
    { flag: '--name <text>', description: 'the canonical name, Tesla, Inc.', required: true },
    {
      flag: '--exposure <slug>',
      description: "the asset group it is, a stablecoin's backing: public-equities",
      required: true,
      choices: vocabularyChoices('asset-group'),
    },
    { flag: '--ticker <text>', description: 'the ticker, TSLA' },
  ],
  fromFlags: (values) => ({ name: values.name, ticker: values.ticker, exposure: values.exposure }),
  files: (template, registry) => {
    const group = registry.vocabulary.find((row) => row.vocabulary === 'asset-group' && row.slug === template.exposure);
    if (!group?.class) {
      const message = `exposure ${String(template.exposure)} is not an asset-group value with a class`;
      throw new NoSuchRowError({ file: 'add underlying', message });
    }
    const slug = template.slug ?? rowSlug(String(template.name));
    const path = homeFile('underlying', { slug, class: group.class });
    return [{ path, content: fileContent('underlying', { ...template, slug }) }];
  },
});
