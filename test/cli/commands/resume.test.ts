import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

const why = (at: string) => ['--at', at, '--reason', 'back up', '--source', 'https://status.example/2'];

describe('resume', () => {
  it('writes a resumed event after the pause and publishes the venue again', async () => {
    const root = writeTree(baseTree());
    await runCli(['pause', 'venue', 'xyz', '--registry', root, ...why('2026-10-24')]);

    const { code } = await runCli(['resume', 'venue', 'xyz', '--registry', root, ...why('2026-10-25')]);

    const venue = readJson(root, 'perps/xyz/venue.json');
    expect(code).toBe(0);
    expect(venue.published).toBe(true);
    expect(venue.events.map((event: { kind: string }) => event.kind)).toEqual(['paused', 'resumed']);
  });

  it('refuses to resume a target that is not paused', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(['resume', 'asset', 'tslax', '--registry', root, ...why('2026-10-25')]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/not paused/);
  });
});

describe('resume, asked', () => {
  const answers = { at: '2026-10-25', reason: 'back up', source: 'https://status.example/2' };

  it('asks the target, its slug, the day, the reason and the source, lists them, and publishes the venue', async () => {
    const root = writeTree(baseTree());
    await runCli(['pause', 'venue', 'xyz', '--registry', root, ...why('2026-10-24')]);
    const prompter = fakeAsk({ target: 'venue', slug: 'xyz', ...answers });

    const { code } = await runCli(['resume', '--registry', root], prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['target', 'slug', 'at', 'reason', 'source', 'confirm']);
    expect(prompter.asked.at(-1)!.message).toContain('source: https://status.example/2');
    expect(readJson(root, 'perps/xyz/venue.json').published).toBe(true);
  });

  it('asks nothing the arguments and flags give but the confirmation', async () => {
    const root = writeTree(baseTree());
    await runCli(['pause', 'venue', 'xyz', '--registry', root, ...why('2026-10-24')]);
    const prompter = fakeAsk({ source: 'https://status.example/2' });

    const { code } = await runCli(
      ['resume', 'venue', 'xyz', '--registry', root, '--at', '2026-10-25', '--reason', 'back up'],
      prompter.ask,
    );

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['source', 'confirm']);
  });

  it('refuses a missing target under --no-input', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(['resume', '--registry', root, '--no-input', ...why('2026-10-25')]);

    expect(code).toBe(1);
    expect(lines).toEqual(['resume: <target> is required', 'resume: <slug> is required']);
  });
});
