import { describe, expect, it } from 'vitest';
import { today } from '../../../src/cli/writeCommand';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

const base = (root: string, target = ['asset', 'tslax'], day = '2026-10-24') => [
  'review',
  ...target,
  '--registry',
  root,
  '--at',
  day,
  '--source',
  'https://x.example/r',
];

describe('review', () => {
  it('writes a dated review event with its outcome, reason and reviewer', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli([
      ...base(root),
      '--outcome',
      'suspicious',
      '--reason',
      'reserves unattested since June',
      '--reviewer',
      'icellama',
    ]);

    expect(code).toBe(0);
    expect(readJson(root, 'assets/xstocks/tslax.json').events.at(-1)).toEqual({
      kind: 'review',
      date: '2026-10-24',
      outcome: 'suspicious',
      reason: 'reserves unattested since June',
      note: 'reviewed by icellama',
      links: ['https://x.example/r'],
    });
  });

  it('sets suspicious from the outcome, true when suspicious and false once cleared', async () => {
    const root = writeTree(baseTree());

    await runCli([...base(root), '--outcome', 'suspicious', '--reason', 'reserves unattested since June']);
    const flagged = readJson(root, 'assets/xstocks/tslax.json').review;
    await runCli([...base(root, ['asset', 'tslax'], '2026-10-25'), '--outcome', 'cleared']);

    expect(flagged).toEqual({ activeAumReviewed: true, suspicious: true, delisted: false });
    expect(readJson(root, 'assets/xstocks/tslax.json').review).toEqual({
      activeAumReviewed: true,
      suspicious: false,
      delisted: false,
    });
  });

  it('reviews a venue as delist names it, setting suspicious with the event', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli([...base(root, ['venue', 'xyz']), '--outcome', 'suspicious', '--reason', 'test']);

    expect(code).toBe(0);
    expect(readJson(root, 'perps/xyz/venue.json').review).toEqual({ suspicious: true, delisted: false });
    expect(readJson(root, 'perps/xyz/venue.json').events.at(-1)).toMatchObject({
      kind: 'review',
      outcome: 'suspicious',
    });
  });

  it('refuses a target that is already suspicious and writes nothing', async () => {
    const root = writeTree(baseTree());
    await runCli([...base(root, ['market', 'xyz:tsla']), '--outcome', 'suspicious', '--reason', 'test']);
    const before = readJson(root, 'perps/xyz/tsla.json');

    const { code, lines } = await runCli([
      ...base(root, ['market', 'xyz:tsla']),
      '--outcome',
      'suspicious',
      '--reason',
      'again',
    ]);

    expect(code).toBe(1);
    expect(readJson(root, 'perps/xyz/tsla.json')).toEqual(before);
  });

  it('refuses a suspicious outcome without a reason', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli([...base(root), '--outcome', 'suspicious', '--json']);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/--reason/);
  });
});

describe('review, asked', () => {
  it('asks the target, its slug, the outcome, the reason, the source, the reviewer and the day, then writes', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({
      target: 'asset',
      slug: 'tslax',
      outcome: 'suspicious',
      reason: 'reserves unattested since June',
      source: 'https://x.example/r',
      reviewer: 'icellama',
    });

    const { code } = await runCli(['review', '--registry', root], prompter.ask);
    const question = (key: string) => prompter.asked.find((asked) => asked.key === key)!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['target', 'slug', 'outcome', 'reason', 'source', 'reviewer', 'at', 'confirm']);
    expect(question('slug').choices).toEqual(['tslax']);
    expect(question('outcome').choices).toEqual(['suspicious', 'cleared']);
    expect(question('at').default).toBe(today());
    expect(prompter.asked.at(-1)!.message).toContain('reviewer: icellama');
    expect(readJson(root, 'assets/xstocks/tslax.json').events.at(-1)).toMatchObject({
      kind: 'review',
      date: today(),
      outcome: 'suspicious',
      note: 'reviewed by icellama',
    });
  });

  it('asks the reason as required when suspicious and as a skip when cleared', async () => {
    const root = writeTree(baseTree());
    const suspicious = fakeAsk({ outcome: 'suspicious', reason: 'x', source: 'https://x.example/r' });
    const cleared = fakeAsk({ outcome: 'cleared', source: 'https://x.example/r' });

    await runCli(['review', 'asset', 'tslax', '--registry', root, '--dry-run'], suspicious.ask);
    await runCli(['review', 'asset', 'tslax', '--registry', root, '--dry-run'], cleared.ask);

    expect(suspicious.keys()[0]).toBe('outcome');
    expect(suspicious.asked.find((question) => question.key === 'reason')!.optional).toBe(false);
    expect(cleared.asked.find((question) => question.key === 'reason')!.optional).toBe(true);
  });

  it('refuses a missing target under --no-input', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(
      ['review', '--registry', root, '--no-input', '--outcome', 'cleared', '--source', 'https://x.example/r'],
      fakeAsk().ask,
    );

    expect(code).toBe(1);
    expect(lines).toEqual(['review: <target> is required', 'review: <slug> is required']);
  });
});
