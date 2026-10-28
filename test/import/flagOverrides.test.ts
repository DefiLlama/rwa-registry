import { describe, expect, it } from 'vitest';
import { flagOverrides } from '../../src/import/flagOverrides';

const VOCABULARY = [
  { vocabulary: 'category', slug: 'rwa-stablecoins', impliesStablecoin: true },
  { vocabulary: 'category', slug: 'yield-wrappers' },
  { vocabulary: 'category', slug: 'governance-tokens', impliesGovernance: true },
  { vocabulary: 'asset-class', slug: 'stable-yield-wrapper' },
  { vocabulary: 'asset-class', slug: 'usd-fiat-stablecoin', impliesStablecoin: true },
  { vocabulary: 'rwa-classification', slug: 'rwa' },
];

// A staged asset as mapAssets writes it, with the sheet's category and asset classes still on it.
const staged = (legacyId: number, symbol: string, category: string[], assetClass: string[]) => ({
  legacyId,
  symbol,
  category,
  assetClass,
  rwaClassification: 'rwa',
});

describe('flagOverrides', () => {
  it("writes today's flag as an override with its reason only where the derived flag differs, and lists the rows", () => {
    const assets: [string, Record<string, unknown>][] = [
      ['assets/ethena/susde.json', staged(8818, 'sUSDe', ['yield-wrappers'], ['stable-yield-wrapper'])],
      ['assets/apyx/apyusd.json', staged(2994, 'apyUSD', ['rwa-stablecoins'], ['stable-yield-wrapper'])],
      [
        'assets/usdyc/usdyc.json',
        staged(386, 'USDYC', ['yield-wrappers'], ['stable-yield-wrapper', 'usd-fiat-stablecoin']),
      ],
      ['assets/sky/sky.json', staged(64, 'SKY', ['governance-tokens', 'rwa-stablecoins'], ['stable-yield-wrapper'])],
    ];

    const { overrides, calls } = flagOverrides(assets, () => ['rwa-stablecoins'], VOCABULARY);

    expect([...overrides.keys()]).toEqual(['assets/ethena/susde.json', 'assets/sky/sky.json']);
    expect(overrides.get('assets/ethena/susde.json')).toEqual({
      stablecoinOverride: false,
      flagReason: expect.stringContaining('stablecoin false'),
    });
    expect(overrides.get('assets/sky/sky.json')).toEqual({
      governanceOverride: true,
      flagReason: expect.stringContaining('governance true'),
    });
    expect(calls.map((call) => call.line)).toEqual([
      expect.stringMatching(/^2 assets keep today's flag/),
      expect.stringMatching(/^8818 sUSDe: stablecoin false/),
      expect.stringMatching(/^64 SKY: governance true/),
    ]);
  });
});
