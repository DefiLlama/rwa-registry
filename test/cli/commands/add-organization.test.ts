import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

const NAME = 'Ondo Global Markets (BVI) Limited';
const FILE = 'reference/organizations/issuer/ondo-global-markets-bvi-limited.json';

describe('add organization', () => {
  it('writes reference/organizations/<kind>/<rwaSlug(name)>.json, the kind left to the folder, with no PID', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['add', 'organization', '--registry', root, '--name', NAME, '--kind', 'issuer']);

    expect(code).toBe(0);
    expect(readJson(root, FILE)).toEqual({ identity: { slug: 'ondo-global-markets-bvi-limited', name: NAME } });
  });

  it('refuses a venue operator, which add venue writes beside its venue', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli([
      ...['add', 'organization', '--registry', root, '--name', 'Hibachi', '--kind', 'venue-operator', '--json'],
    ]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('add venue');
  });
});

describe('add organization, asked', () => {
  it('asks the name and kind before the slug it derives from the name, then the parent', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ name: NAME, kind: 'issuer' });

    const { code } = await runCli(['add', 'organization', '--registry', root], prompter.ask);
    const slug = prompter.asked.find((question) => question.key === 'slug')!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual([
      'name',
      'kind',
      'slug',
      'parent',
      'protocolSlug',
      'description',
      'logo',
      'linksWebsite',
      'linksTwitter',
      'linksDocs',
      'linksLinkedin',
      'linksDiscord',
      'linksTelegram',
      'linksGithub',
      'linksRefLinks',
      'registryInfo',
      'foundedYear',
      'headquarters',
      'founders',
      'regulatoryStatus',
      'keyMilestones',
      'entityStructureNotes',
      'identifiers',
      'confirm',
    ]);
    expect(slug.default).toBe('ondo-global-markets-bvi-limited');
    expect(readJson(root, FILE).identity.slug).toBe('ondo-global-markets-bvi-limited');
  });
});
