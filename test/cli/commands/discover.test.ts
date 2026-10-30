import { describe, expect, it, vi } from 'vitest';
import { createDiscoverCommand } from '../../../src/cli/commands/discover';
import type { ChainReads } from '../../fakes/rpc';
import { TimeoutError } from '../../../src/errors';
import { fakeDiscoverDeps } from '../../fakes/discover';
import { fakeChain } from '../../fakes/rpc';
import { baseTree, undatedTslax, writeTree } from '../../fixtures/tree';

const chain = (reads: Partial<ChainReads> = {}) =>
  fakeChain(37, {
    evmCall: vi.fn(async ({ calls }) => calls.map(() => null)),
    solanaSignatures: vi.fn(async () => []),
    ...reads,
  });

const run = async (args: string[], flags: Record<string, unknown> = {}, rpc = chain()) => {
  const lines: string[] = [];
  const command = createDiscoverCommand({ env: {}, deps: () => fakeDiscoverDeps({ rpc }) });
  const code = await command.run(
    { args, registry: writeTree(baseTree()), ...flags },
    { print: (line: string) => lines.push(line) },
  );
  return { code, lines };
};

describe('discover command', () => {
  it('prints an address as JSON with --json, and names a missing action', async () => {
    const shown = await run(['address', 'ethereum:0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0'], { json: true });
    const missing = await run([]);

    expect(shown.code).toBe(0);
    expect(JSON.parse(shown.lines.join('\n'))).toMatchObject({ deployedAt: '2025-06-30', basis: 'first-code' });
    expect(missing).toEqual({ code: 1, lines: ['discover needs address <chain:address> or dates'] });
  });

  it('refuses a --limit that is not a count', async () => {
    const uncounted = await run(['dates'], { platform: 'xstocks', limit: 'ten' });

    expect(uncounted).toEqual({ code: 1, lines: ['discover dates: --limit ten is not a count'] });
  });

  it('ends a dates run with one line per kind of null, with its count and its detail', async () => {
    const timedOut = new TimeoutError({ source: 'rpc', reason: 'timeout', message: 'ethereum head: no answer' });
    const rpc = chain({ evmHead: vi.fn(async () => Promise.reject(timedOut)) });
    const { lines } = await run(
      ['dates'],
      { platform: 'xstocks', registry: writeTree({ ...baseTree(), 'assets/xstocks/tslax.json': undatedTslax() }) },
      rpc,
    );

    expect(lines.filter((line) => line.startsWith('null '))).toEqual([
      expect.stringMatching(/^null not-found 1: /),
      expect.stringMatching(/^null code-search-timeout 1: /),
    ]);
  });
});
