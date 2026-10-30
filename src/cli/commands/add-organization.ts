/**
 * add organization: one issuer, oracle, auditor or other firm under reference/organizations/<kind>/; a platform goes to its asset folder; a new organization gets no PID.
 * @dev review: src/cli/addCommand.ts
 */
import { FlagFormatError } from '../../errors/cli';
import { homeFile, rwaSlug } from '../../registry';
import type { Registry } from '../../schema';
import { defineAddCommand, fileContent, organizationChoices, type FileToWrite, type Template } from '../addCommand';

// The kind decides the home and is left to it: a platform names an asset folder, any other kind a folder of reference/organizations/.
export const organizationFiles = (template: Template): FileToWrite[] => {
  if (template.kind === 'venue-operator') {
    throw new FlagFormatError({
      file: 'add organization',
      message: 'a venue operator is added with add venue, beside its venue',
    });
  }
  const row = { ...template, slug: template.slug ?? rwaSlug(String(template.name)) };
  return [{ path: homeFile('organization', row), content: fileContent('organization', row) }];
};

const kindChoices = (registry: Registry) =>
  registry.vocabulary
    .filter((row) => row.vocabulary === 'organization-kind' && row.slug !== 'venue-operator')
    .map((row) => row.slug);

export const addOrganization = defineAddCommand({
  name: 'add organization',
  description: 'add one organization file, such as an issuer a role names',
  template: 'organization',
  fields: [
    { flag: '--name <text>', description: 'the legal or brand name, Backed Assets (JE) Limited', required: true },
    {
      flag: '--kind <kind>',
      description: 'its kind, which names its folder: issuer, oracle, auditor, custodian and the others',
      required: true,
      choices: kindChoices,
    },
    {
      flag: '--slug <slug>',
      description: 'the file name, rwaSlug of the name by default',
      derive: (values) => (values.name === undefined ? undefined : { value: rwaSlug(String(values.name)) }),
    },
    { flag: '--parent <slug>', description: 'the organization it belongs to', choices: organizationChoices },
  ],
  fromFlags: (values) => ({ slug: values.slug, name: values.name, kind: values.kind, parent: values.parent }),
  files: organizationFiles,
});
