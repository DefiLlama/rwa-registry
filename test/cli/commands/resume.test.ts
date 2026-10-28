import { describe, expect, it } from 'vitest';
import { baseTree, writeTree } from '../../fixtures/tree';
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
