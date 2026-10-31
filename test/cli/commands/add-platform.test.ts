import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

describe('add platform', () => {
  it('writes assets/<rwaSlug(name)>/platform.json, the kind left to its home, with no PID', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['add', 'platform', '--registry', root, '--name', 'Backed Finance']);

    expect(code).toBe(0);
    expect(readJson(root, 'assets/backed-finance/platform.json')).toEqual({
      identity: { slug: 'backed-finance', name: 'Backed Finance' },
      review: { suspicious: false, delisted: false },
    });
  });
});

describe('add platform, asked', () => {
  it('asks the name and shows the slug it assigns at the confirmation', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ name: 'Backed Finance' });

    const { code } = await runCli(['add', 'platform', '--registry', root], prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual([
      'name',
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
      'category',
      'platformType',
      'accessModel',
      'primaryChain',
      'chains',
      'attestationFrequency',
      'onchainMcapBasis',
      'feesNow',
      'identifiers',
      'confirm',
    ]);
    expect(prompter.asked.at(-1)!.message).toContain('slug: backed-finance (assigned)');
  });

  it('asks the fee terms only after a yes, and writes the numbers as numbers', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({
      name: 'Backed Finance',
      foundedYear: '2021',
      feesNow: true,
      feesMintFeeBps: '25',
      feesRevenueModel: 'mint and redemption fees',
    });

    const { code, lines } = await runCli(['add', 'platform', '--registry', root], prompter.ask);
    const written = readJson(root, 'assets/backed-finance/platform.json');

    expect(code, lines.join('\n')).toBe(0);
    expect(prompter.keys()).toEqual(
      expect.arrayContaining(['feesRevenueModel', 'feesFeeLastVerified', 'feesRevenueMix']),
    );
    expect(written.about.foundedYear).toBe(2021);
    expect(written.platform.fees).toEqual({ revenueModel: 'mint and redemption fees', mintFeeBps: 25 });
  });

  it('refuses a number answered with words, naming the field', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ name: 'Backed Finance', foundedYear: 'twenty' });

    const { code, lines } = await runCli(['add', 'platform', '--registry', root], prompter.ask);

    expect(code).toBe(1);
    expect(lines).toEqual(['foundedYear: twenty is not a whole number']);
  });
});
