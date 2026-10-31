/**
 * add organization: one issuer, oracle, auditor or other firm under reference/organizations/<kind>/; a platform goes to its asset folder; a new organization gets no PID.
 * @dev review: src/cli/addCommand.ts
 */
import { FlagFormatError } from '../../errors/cli';
import { homeFile, rwaSlug } from '../../registry';
import { defineAddCommand, fileContent, type FileToWrite, type Template } from '../addCommand';
import { refused, type AnswerType } from '../answers/answerType';
import { referenceOf, vocabulary } from '../answers/picks';
import { slug } from '../answers/text';

// The kind decides the home and is left to it: a platform names an asset folder, any other kind a folder of reference/organizations/.
const VENUE_OPERATOR = 'a venue operator is added with add venue, beside its venue';

export const organizationFiles = (template: Template): FileToWrite[] => {
  if (template.kind === 'venue-operator')
    throw new FlagFormatError({ file: 'add organization', message: VENUE_OPERATOR });
  const row = { ...template, slug: template.slug ?? rwaSlug(String(template.name)) };
  return [{ path: homeFile('organization', row), content: fileContent('organization', row) }];
};

// A venue operator is refused with where it goes, rather than as a value missing from the list.
const kinds = vocabulary('organization-kind', (kind) => kind !== 'venue-operator');
const kindAnswer: AnswerType = {
  ...kinds,
  read: (typed, context) => (typed === 'venue-operator' ? refused(VENUE_OPERATOR) : kinds.read(typed, context)),
};

export const addOrganization = defineAddCommand({
  name: 'add organization',
  description: 'add one organization file, such as an issuer a role names',
  template: 'organization',
  fields: [
    {
      flag: '--name <text>',
      description: 'the legal or brand name, Backed Assets (JE) Limited',
      label: 'name',
      question: 'What is the legal or brand name of the organization?',
      example: 'Backed Assets (JE) Limited',
      required: true,
    },
    {
      flag: '--kind <kind>',
      description: 'its kind, which names its folder: issuer, oracle, auditor, custodian and the others',
      label: 'kind',
      question: 'What kind of organization is it?',
      required: true,
      answer: kindAnswer,
    },
    {
      flag: '--slug <slug>',
      description: 'the file name, rwaSlug of the name by default',
      label: 'slug',
      question: 'Which slug names its file?',
      answer: slug,
      derive: (values) =>
        values.name === undefined ? undefined : { value: rwaSlug(String(values.name)), why: 'the slug of the name' },
    },
    {
      flag: '--parent <slug>',
      description: 'the organization it belongs to',
      label: 'parent organization',
      question: 'Which organization does it belong to?',
      answer: referenceOf('organization', 'parent'),
    },
  ],
  derived: ['legacyPid'],
  fromFlags: (values) => ({ slug: values.slug, name: values.name, kind: values.kind, parent: values.parent }),
  files: organizationFiles,
});
