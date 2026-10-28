/**
 * add underlying: reference/underlyings/<class>/<slug>.json, one economic exposure keyed on its canonical name, with the asset group it is; the folder holds the class.
 * @dev review: src/cli/addCommand.ts
 */
import { homeFile, rowSlug } from '../../registry';
import { defineAddCommand, fileContent, vocabularyChoices } from '../addCommand';

export const addUnderlying = defineAddCommand({
  name: 'add underlying',
  description: 'add one underlying file',
  template: 'underlying',
  fields: [
    { flag: '--name <text>', description: 'the canonical name, Tesla, Inc.', required: true },
    {
      flag: '--class <slug>',
      description: 'the underlying class',
      required: true,
      choices: vocabularyChoices('underlying-class'),
    },
    {
      flag: '--exposure <slug>',
      description: "the asset group it is, a stablecoin's backing: public-equities",
      required: true,
      choices: vocabularyChoices('asset-group'),
    },
    { flag: '--ticker <text>', description: 'the ticker, TSLA' },
  ],
  fromFlags: (values) => ({ class: values.class, name: values.name, ticker: values.ticker, exposure: values.exposure }),
  files: ({ class: kind, ...template }) => {
    const slug = template.slug ?? rowSlug(String(template.name));
    const path = homeFile('underlying', { slug, class: kind });
    return [{ path, content: fileContent('underlying', { ...template, slug }) }];
  },
});
