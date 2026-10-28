/**
 * add chain: reference/chains/<slug>.json on an address family a reader exists for, with that family's burn addresses.
 * @dev review: src/cli/addCommand.ts
 */
import { BURN_ADDRESSES, homeFile, rowSlug } from '../../registry';
import { ADDRESS_FAMILIES, type AddressFamily } from '../../schema';
import { defineAddCommand, fileContent } from '../addCommand';

export const addChain = defineAddCommand({
  name: 'add chain',
  description: 'add one chain file',
  template: 'chain',
  fields: [
    { flag: '--name <text>', description: 'the chain label the app shows, Dusk', required: true },
    { flag: '--slug <slug>', description: 'the chain slug, the slug of the name by default' },
    {
      flag: '--family <family>',
      description: 'the address family',
      required: true,
      choices: () => [...ADDRESS_FAMILIES],
    },
    { flag: '--caip2 <id>', description: 'the CAIP-2 id, eip155:1' },
  ],
  fromFlags: (values) => ({ slug: values.slug, label: values.name, addressFamily: values.family, caip2: values.caip2 }),
  files: (template) => {
    const slug = template.slug ?? rowSlug(String(template.label));
    const burnAddresses = template.burnAddresses ?? BURN_ADDRESSES[template.addressFamily as AddressFamily];
    return [{ path: homeFile('chain', { slug }), content: fileContent('chain', { ...template, slug, burnAddresses }) }];
  },
});
