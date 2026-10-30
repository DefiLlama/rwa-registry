import { describe, expect, it } from 'vitest';
import { today } from '../../../src/cli/writeCommand';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

const base = (root: string) => [
  'review',
  'tslax',
  '--registry',
  root,
  '--at',
  '2026-10-24',
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

  it('refuses a suspicious outcome without a reason', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli([...base(root), '--outcome', 'suspicious', '--json']);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/--reason/);
  });
});

describe('review, asked', () => {
  it('asks the asset, the outcome, the reason, the source, the reviewer and the day, then writes', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({
      asset: 'tslax',
      outcome: 'suspicious',
      reason: 'reserves unattested since June',
      source: 'https://x.example/r',
      reviewer: 'icellama',
    });

    const { code } = await runCli(['review', '--registry', root], prompter.ask);
    const question = (key: string) => prompter.asked.find((asked) => asked.key === key)!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['asset', 'outcome', 'reason', 'source', 'reviewer', 'at', 'confirm']);
    expect(question('asset').choices).toEqual(['tslax']);
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

    await runCli(['review', 'tslax', '--registry', root, '--dry-run'], suspicious.ask);
    await runCli(['review', 'tslax', '--registry', root, '--dry-run'], cleared.ask);

    expect(suspicious.keys()[0]).toBe('outcome');
    expect(suspicious.asked.find((question) => question.key === 'reason')!.optional).toBe(false);
    expect(cleared.asked.find((question) => question.key === 'reason')!.optional).toBe(true);
  });

  it('refuses a missing asset under --no-input', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(
      ['review', '--registry', root, '--no-input', '--outcome', 'cleared', '--source', 'https://x.example/r'],
      fakeAsk().ask,
    );

    expect(code).toBe(1);
    expect(lines).toEqual(['review: <asset> is required']);
  });
});
