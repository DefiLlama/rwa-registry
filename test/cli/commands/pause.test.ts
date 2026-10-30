import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

const why = ['--at', '2026-10-24', '--reason', 'maintenance', '--source', 'https://status.example/1'];

describe('pause', () => {
  it('writes a paused event on a venue and unpublishes it', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['pause', 'venue', 'xyz', '--registry', root, ...why]);

    const venue = readJson(root, 'perps/xyz/venue.json');
    expect(code).toBe(0);
    expect(venue.published).toBe(false);
    expect(venue.events).toEqual([
      { kind: 'paused', date: '2026-10-24', reason: 'maintenance', links: ['https://status.example/1'] },
    ]);
  });

  it('refuses to pause a target that is paused', async () => {
    const root = writeTree(baseTree());
    await runCli(['pause', 'asset', 'tslax', '--registry', root, ...why]);

    const { code, lines } = await runCli(['pause', 'asset', 'tslax', '--registry', root, ...why]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/already paused/);
  });
});

describe('pause, asked', () => {
  const answers = { reason: 'maintenance', source: 'https://status.example/1' };

  it('asks the target, its slug, the day, the reason and the source, lists them, and pauses the venue', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ target: 'venue', slug: 'xyz', at: '2026-10-24', ...answers });

    const { code } = await runCli(['pause', '--registry', root], prompter.ask);
    const confirm = prompter.asked.at(-1)!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['target', 'slug', 'at', 'reason', 'source', 'confirm']);
    expect(prompter.asked.find((question) => question.key === 'slug')!.choices).toEqual(['xyz']);
    for (const line of ['target: venue', 'slug: xyz', 'at: 2026-10-24', 'reason: maintenance'])
      expect(confirm.message).toContain(line);
    expect(readJson(root, 'perps/xyz/venue.json').published).toBe(false);
  });

  it('asks only the slug when the target kind is given', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ slug: 'tslax', ...answers });

    const { code } = await runCli(['pause', 'asset', '--registry', root, '--at', '2026-10-24'], prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['slug', 'reason', 'source', 'confirm']);
  });

  it('refuses a missing slug under --no-input', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(['pause', 'venue', '--registry', root, '--no-input', ...why]);

    expect(code).toBe(1);
    expect(lines).toEqual(['pause: <slug> is required']);
  });
});
