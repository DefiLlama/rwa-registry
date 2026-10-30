import { describe, expect, it, vi } from 'vitest';
import { createAddMarketCommand } from '../../../src/cli/commands/add-market';
import type { VenueTarget } from '../../../src/discover/listings/listingReader';
import { found, missing, type DateResult } from '../../../src/discover/dateResult';
import { baseTree, writeTree } from '../../fixtures/tree';
import { templateFile } from '../../../src/cli/templates';
import { fakeAsk } from '../../fakes/prompter';
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
  it('writes perps/<venue>/<lowercase symbol>.json with no legacy id, and no event under --no-discover, noted', async () => {
    const { code, file, lines, listings } = await add(found(1, null, 'x', 'listing-field'), { discover: false });

    expect(code).toBe(0);
    expect(listings).not.toHaveBeenCalled();
    expect(lines).toEqual([
      'xyz:TSLA_USD: no listing event from the venue under --no-discover',
      expect.stringMatching(/^wrote .*perps\/xyz\/tsla_usd\.json$/),
    ]);
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

  it('writes from templates/market.json the file the flags write, the oracle role included', async () => {
    const tree = {
      ...baseTree(),
      'reference/underlyings/equity/ionq-inc.json': {
        slug: 'ionq-inc',
        name: 'IonQ, Inc.',
        ticker: 'IONQ',
        exposure: 'public-equities',
      },
      'reference/organizations/oracle/pyth-network.json': { identity: { slug: 'pyth-network', name: 'Pyth Network' } },
    };
    const byFlags = writeTree(tree);
    const byFile = writeTree(tree);
    const flags = ['--venue', 'xyz', '--symbol', 'IONQ', '--tracks', 'ionq-inc', '--pair', 'IONQ-USDC'];
    const oracle = ['--oracle', 'pyth-network'];
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

describe('add market, asked', () => {
  it('asks the venue and what it tracks before the symbol, offers the venue listing day, and keeps its source', async () => {
    const { 'perps/xyz/tsla.json': _, ...tree } = baseTree();
    const root = writeTree(tree);
    const source = 'https://api.hyperliquid.xyz/info';
    const listings = vi.fn(async (targets: VenueTarget[]) =>
      targets.map(() => found(1763712000, null, source, 'listing-field')),
    );
    const command = createAddMarketCommand({ reads: () => ({ dates: vi.fn(), listings }) });
    const prompter = fakeAsk({ venue: 'xyz', tracks: 'tesla-inc', structure: 'stock-perp' });

    const code = await command.run(
      { args: [], registry: root, discover: true },
      { print: () => undefined, ask: prompter.ask },
    );
    const symbol = prompter.asked.find((question) => question.key === 'symbol')!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual([
      'venue',
      'tracksAsset',
      'tracks',
      'symbol',
      'structure',
      'pair',
      'collateral',
      'oracle',
      'listed',
      'confirm',
    ]);
    expect(symbol.default).toBe('TSLA');
    expect(listings).toHaveBeenCalledTimes(1);
    expect(prompter.asked.at(-1)!.message).toContain('id: xyz:tsla (assigned)');
    expect(readJson(root, 'perps/xyz/tsla.json').events).toEqual([
      { kind: 'listing', date: '2025-11-21', links: [source] },
    ]);
  });
});
