/**
 * add platform: assets/<rwaSlug(name)>/platform.json of kind platform; a new organization gets no PID.
 * @dev review: src/cli/commands/add-organization.ts
 */
import { defineAddCommand } from '../addCommand';
import { organizationFiles } from './add-organization';

export const addPlatform = defineAddCommand({
  name: 'add platform',
  description: 'add the platform.json of a new asset folder',
  template: 'platform',
  fields: [{ flag: '--name <text>', description: 'the platform name the app shows, Backed Finance', required: true }],
  fromFlags: (values) => ({ name: values.name }),
  files: (template) => organizationFiles({ ...template, kind: 'platform' }),
});
