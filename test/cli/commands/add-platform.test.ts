import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { each, fakeAsk } from '../../fakes/prompter';
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
      'keyMilestones.when',
      'entityStructureNotes',
      'category',
      'platformType',
      'accessModel',
      'chains',
      'attestationFrequency',
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

  it('writes the one chain picked as the primary chain without asking', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ name: 'Backed Finance', chains: ['solana'] });

    await runCli(['add', 'platform', '--registry', root], prompter.ask);

    expect(prompter.keys()).not.toContain('primaryChain');
    expect(readJson(root, 'assets/backed-finance/platform.json').platform).toEqual({
      primaryChain: 'solana',
      chains: ['solana'],
    });
  });

  it('asks the primary chain after two chains are picked, from those two', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ name: 'Backed Finance', chains: ['solana', 'ethereum'], primaryChain: 'ethereum' });

    await runCli(['add', 'platform', '--registry', root], prompter.ask);
    const keys = prompter.keys();
    const primary = prompter.asked.find((question) => question.key === 'primaryChain')!;

    expect(keys.indexOf('primaryChain')).toBe(keys.indexOf('chains') + 1);
    expect(primary.choices).toEqual(['solana', 'ethereum']);
    expect(readJson(root, 'assets/backed-finance/platform.json').platform.primaryChain).toBe('ethereum');
  });

  it('asks the milestones one at a time and writes them as one text, the latest first', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({
      name: 'Backed Finance',
      'keyMilestones.when': each('2026-01', '2025'),
      'keyMilestones.what': each('MiCA license granted, in Germany', 'launch'),
      'keyMilestones.more': each(true, false),
    });

    await runCli(['add', 'platform', '--registry', root], prompter.ask);

    expect(readJson(root, 'assets/backed-finance/platform.json').about.keyMilestones).toBe(
      '2026-01: MiCA license granted, in Germany | 2025: launch',
    );
  });
});
