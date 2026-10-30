import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../../../src/cli';
import { ASKS, today } from '../../../src/cli/writeCommand';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

const why = ['--at', '2026-10-24', '--reason', 'venue closed the book', '--source', 'https://x.example/notice'];

describe('delist', () => {
  it('writes a dated delisting event on the market file, which derives the delisted status', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['delist', 'market', 'xyz:TSLA', '--registry', root, ...why]);

    expect(code).toBe(0);
    expect(readJson(root, 'perps/xyz/tsla.json').events).toEqual([
      { kind: 'delisting', date: '2026-10-24', reason: 'venue closed the book', links: ['https://x.example/notice'] },
    ]);
  });

  it('refuses a target that is already delisted and writes nothing', async () => {
    const root = writeTree(baseTree());
    await runCli(['delist', 'market', 'xyz:tsla', '--registry', root, ...why]);
    const before = readFileSync(join(root, 'perps/xyz/tsla.json'), 'utf8');

    const { code, lines } = await runCli(['delist', 'market', 'xyz:tsla', '--registry', root, ...why]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/already delisted/);
    expect(readFileSync(join(root, 'perps/xyz/tsla.json'), 'utf8')).toBe(before);
  });

  it('refuses a slug that names no row of the target table', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(['delist', 'platform', 'nope', '--registry', root, ...why]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/no platform nope/);
  });

  it('delists a venue operator as a platform, since its Platforms tab row is published as one', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['delist', 'platform', 'trade-xyz', '--registry', root, ...why]);

    expect(code).toBe(0);
    expect(readJson(root, 'perps/xyz/organization.json').events.at(-1)).toMatchObject({ kind: 'delisting' });
  });
});

describe('delist, asked', () => {
  const answers = { reason: 'venue closed the book', source: 'https://x.example/notice' };

  it('says in --help that the arguments may be left out and that it asks for them', async () => {
    const lines: string[] = [];

    await expect(main(['delist', '--help'], { print: (line) => lines.push(line) })).rejects.toThrow();

    expect(lines[0]).toBe('Usage: defillama-rwa delist [options] [target] [slug]');
    expect(lines).toContain(ASKS);
  });

  it('asks the target, its slug among that kind, the day, the reason and the source, then confirms and writes', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ target: 'market', slug: 'xyz:tsla', ...answers });

    const { code } = await runCli(['delist', '--registry', root], prompter.ask);
    const slug = prompter.asked.find((question) => question.key === 'slug')!;
    const day = prompter.asked.find((question) => question.key === 'at')!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['target', 'slug', 'at', 'reason', 'source', 'confirm']);
    expect(slug.choices).toEqual(['xyz:tsla']);
    expect(day.default).toBe(today());
    expect(prompter.asked.at(-1)!.message).toContain('target: market');
    expect(prompter.asked.at(-1)!.message).toContain('slug: xyz:tsla');
    expect(readJson(root, 'perps/xyz/tsla.json').events).toEqual([
      { kind: 'delisting', date: today(), reason: answers.reason, links: [answers.source] },
    ]);
  });

  it('skips the question of each argument given', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk(answers);

    const { code } = await runCli(['delist', 'venue', 'xyz', '--registry', root], prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['at', 'reason', 'source', 'confirm']);
  });

  it('refuses a missing target under --no-input, as before, and asks nothing', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk();

    const { code, lines } = await runCli(['delist', '--registry', root, '--no-input', ...why], prompter.ask);

    expect(code).toBe(1);
    expect(prompter.keys()).toEqual([]);
    expect(lines).toEqual(['delist: <target> is required', 'delist: <slug> is required']);
  });

  it('writes nothing when the person answers no at the confirmation', async () => {
    const root = writeTree(baseTree());
    const before = readFileSync(join(root, 'assets/xstocks/tslax.json'), 'utf8');

    const { code } = await runCli(
      ['delist', 'asset', 'tslax', '--registry', root],
      fakeAsk({ ...answers, confirm: false }).ask,
    );

    expect(code).toBe(1);
    expect(readFileSync(join(root, 'assets/xstocks/tslax.json'), 'utf8')).toBe(before);
  });
});
