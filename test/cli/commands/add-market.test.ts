import { describe, expect, it, vi } from 'vitest';
import { createAddMarketCommand } from '../../../src/cli/commands/add-market';
import type { VenueTarget } from '../../../src/discover/listings/listingReader';
import { found, missing, type DateResult } from '../../../src/discover/dateResult';
import { baseTree, writeTree } from '../../fixtures/tree';
import { templateFile } from '../../../src/cli/templates';
import { readJson, readText, runCli } from '../runCli';

const add = async (listing: DateResult, flags = {}) => {
  const { 'perps/xyz/tsla.json': _, ...tree } = baseTree();
  const root = writeTree(tree);
  const listings = vi.fn(async (targets: VenueTarget[]) => targets.map(() => listing));
  const command = createAddMarketCommand({ reads: () => ({ dates: vi.fn(), listings }) });
  const lines: string[] = [];
  const options = {
    args: [],
    registry: root,
    venue: 'xyz',
    symbol: 'TSLA_USD',
    tracks: 'tesla-inc',
    structure: 'stock-perp',
    ...flags,
  };
  const code = await command.run(options, { print: (line: string) => lines.push(line) });
  return { code, lines, listings, file: () => readJson(root, 'perps/xyz/tsla_usd.json') };
};

describe('add market', () => {
  it('writes perps/<venue>/<lowercase symbol>.json with no legacy id, and no event under --no-discover', async () => {
    const { code, file, listings } = await add(found(1, null, 'x', 'listing-field'), { discover: false });

    expect(code).toBe(0);
    expect(listings).not.toHaveBeenCalled();
    expect(file()).toEqual({
      identity: { symbol: 'TSLA_USD' },
      tracks: { underlying: 'tesla-inc', structure: 'stock-perp' },
    });
  });

  it("writes the listing event the venue's answer dates, with its source", async () => {
    const source = 'https://api.hyperliquid.xyz/info';
    const { file, listings } = await add(found(1763712000, null, source, 'listing-field'));

    expect(listings.mock.calls[0]![0]).toEqual([expect.objectContaining({ venue: 'xyz', symbol: 'TSLA_USD' })]);
    expect(file().events).toEqual([{ kind: 'listing', date: '2025-11-21', links: [source] }]);
  });

  it('writes no event when the venue gives no listing date', async () => {
    const { code, file } = await add(missing('needs-history-dump', 'xyz funding history TSLA_USD'));

    expect(code).toBe(0);
    expect(file().events).toBeUndefined();
  });

  it('writes from templates/market.json the file the flags write, the oracle override included', async () => {
    const ionq = { slug: 'ionq-inc', name: 'IonQ, Inc.', ticker: 'IONQ', exposure: 'public-equities' };
    const byFlags = writeTree({ ...baseTree(), 'reference/underlyings/equity/ionq-inc.json': ionq });
    const byFile = writeTree({ ...baseTree(), 'reference/underlyings/equity/ionq-inc.json': ionq });
    const flags = ['--venue', 'xyz', '--symbol', 'IONQ', '--tracks', 'ionq-inc', '--pair', 'IONQ-USDC'];
    const oracle = ['--oracle', 'Pyth equity feed'];
    const classes = ['--structure', 'stock-perp', '--no-discover'];

    await runCli(['add', 'market', '--registry', byFlags, ...flags, ...oracle, ...classes]);
    const { code } = await runCli([
      'add',
      'market',
      '--registry',
      byFile,
      '--from',
      templateFile('market'),
      '--no-discover',
    ]);

    expect(code).toBe(0);
    expect(readText(byFile, 'perps/xyz/ionq.json')).toBe(readText(byFlags, 'perps/xyz/ionq.json'));
  });
});
