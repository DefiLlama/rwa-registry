/**
 * add rule: one category rule in reference/vocabularies/category-rules.json, the file kept sorted by structure and exposure.
 * @dev review: src/cli/commands/add-value.ts
 */
import { homeFile } from '../../registry';
import { defineAddCommand, fileContent, vocabularyChoices } from '../addCommand';

export const addRule = defineAddCommand({
  name: 'add rule',
  description: 'add one category rule for a structure and an exposure',
  template: 'category-rule',
  fields: [
    {
      flag: '--structure <slug>',
      description: 'the asset class of the assets it shelves, stock-backed',
      required: true,
      choices: vocabularyChoices('asset-class'),
    },
    {
      flag: '--exposure <slug>',
      description: "the asset group of their underlying's exposure, public-equities",
      required: true,
      choices: vocabularyChoices('asset-group'),
    },
    {
      flag: '--category <slugs...>',
      description: 'the categories they sit under, first the main one',
      required: true,
      list: true,
      choices: vocabularyChoices('category'),
    },
  ],
  fromFlags: (values) => ({ structure: values.structure, exposure: values.exposure, category: values.category }),
  files: (template, registry) => {
    const rules = registry.category_rule.map((row) => ({ ...row }) as Record<string, unknown>);
    const pair = `${template.structure}:${template.exposure}`;
    const conflict = rules.some((row) => `${row.structure}:${row.exposure}` === pair)
      ? `a rule for ${template.structure} and ${template.exposure} is already in the file`
      : undefined;
    const content = [...rules, fileContent('category_rule', template)].sort(
      (a, b) =>
        String(a.structure).localeCompare(String(b.structure)) || String(a.exposure).localeCompare(String(b.exposure)),
    );
    return [{ path: homeFile('category_rule', {}), content, replaces: true, conflict }];
  },
});
