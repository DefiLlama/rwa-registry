import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { templateFile } from '../../../src/cli/templates';
import { readJson, readText, runCli, templateCopy } from '../runCli';

const venue = [
  '--venue-type',
  'dex',
  '--access-model',
  'permissionless',
  '--rwa-classification',
  'programmable-finance',
];

describe('add venue', () => {
  it('writes perps/<slug>/venue.json unpublished, and its operator beside it when none exists', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli([
      'add',
      'venue',
      '--registry',
      root,
      '--name',
      'Hibachi',
      '--chain',
      'ethereum',
      ...venue,
    ]);

    expect(code).toBe(0);
    expect(readJson(root, 'perps/hibachi/venue.json')).toEqual({
      slug: 'hibachi',
      organization: 'hibachi',
      venueType: 'dex',
      chain: 'ethereum',
      published: false,
      accessModel: 'permissionless',
      rwaClassification: 'programmable-finance',
    });
    expect(readJson(root, 'perps/hibachi/organization.json')).toEqual({
      identity: { slug: 'hibachi', name: 'Hibachi' },
    });
  });

  it('points at an organization that exists and writes no other file', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli([
      'add',
      'venue',
      '--registry',
      root,
      '--name',
      'km',
      '--organization',
      'trade-xyz',
      ...venue,
    ]);

    expect(code).toBe(0);
    expect(readJson(root, 'perps/km/venue.json').organization).toBe('trade-xyz');
    expect(existsSync(join(root, 'perps/km/organization.json'))).toBe(false);
  });

  it('writes from templates/venue.json the file the flags write', async () => {
    const tree = () => ({
      ...baseTree(),
      'assets/hibachi/platform.json': {
        identity: { slug: 'hibachi', name: 'Hibachi' },
        platform: { primaryChain: 'arbitrum' },
      },
    });
    const byFlags = writeTree(tree());
    const byFile = writeTree(tree());
    const flags = ['--name', 'Hibachi', '--organization', 'hibachi', '--chain', 'arbitrum', '--adapter', 'hibachi'];

    await runCli(['add', 'venue', '--registry', byFlags, ...flags, ...venue]);
    const { code } = await runCli(['add', 'venue', '--registry', byFile, '--from', templateFile('venue')]);

    expect(code).toBe(0);
    expect(readText(byFile, 'perps/hibachi/venue.json')).toBe(readText(byFlags, 'perps/hibachi/venue.json'));
  });

  it('writes the operator a template carries beside the venue when the registry has no organization of its slug', async () => {
    const root = writeTree(baseTree());
    const operator = { slug: 'hibachi', name: 'Hibachi', links: { website: ['https://hibachi.xyz'] } };

    const { code } = await runCli([
      'add',
      'venue',
      '--registry',
      root,
      '--from',
      templateCopy('venue', (filled) => ({ ...filled, operator })),
    ]);

    expect(code).toBe(0);
    expect(readJson(root, 'perps/hibachi/venue.json').organization).toBe('hibachi');
    expect(readJson(root, 'perps/hibachi/organization.json')).toEqual({
      identity: { slug: 'hibachi', name: 'Hibachi' },
      about: { links: { website: ['https://hibachi.xyz'] } },
    });
  });
});

describe('add venue, asked', () => {
  it('asks the name before the slug it derives, the operator before the parent, and publishing yes or no', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({
      name: 'Hibachi',
      venueType: 'dex',
      accessModel: 'permissionless',
      rwaClassification: 'programmable-finance',
    });

    const { code } = await runCli(['add', 'venue', '--registry', root], prompter.ask);
    const published = prompter.asked.find((question) => question.key === 'published')!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual([
      'name',
      'venueType',
      'accessModel',
      'rwaClassification',
      'slug',
      'organization',
      'parent',
      'chain',
      'adapter',
      'published',
      'makerFeeBps',
      'takerFeeBps',
      'deployerFeeShare',
      'fundingRetentionPct',
      'conventionNote',
      'confirm',
    ]);
    expect(published).toMatchObject({ confirm: true, default: false });
    expect(readJson(root, 'perps/hibachi/venue.json').published).toBe(false);
  });
});
