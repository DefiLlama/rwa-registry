/**
 * add platform: assets/<rwaSlug(name)>/platform.json of kind platform; a new organization gets no PID.
 * @dev review: src/cli/commands/add-organization.ts
 */
import { rwaSlug } from '../../registry';
import { defineAddCommand } from '../addCommand';
import { organizationFiles } from './add-organization';

export const addPlatform = defineAddCommand({
  name: 'add platform',
  description: 'add the platform.json of a new asset folder',
  template: 'platform',
  fields: [
    {
      flag: '--name <text>',
      description: 'the platform name the app shows, Backed Finance',
      label: 'platform name',
      question: 'What name does the app show for the platform?',
      example: 'Backed Finance',
      required: true,
    },
  ],
  // A new platform has no PID; the write sets suspicious and delisted from the file's events.
  derived: ['kind', 'slug', 'legacyPid', 'suspicious', 'delisted'],
  assigned: [
    { name: 'slug', derive: (values) => (values.name === undefined ? undefined : rwaSlug(String(values.name))) },
  ],
  fromFlags: (values) => ({ name: values.name }),
  files: (template) => organizationFiles({ ...template, kind: 'platform' }),
});
