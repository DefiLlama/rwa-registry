import { describe, expect, it } from 'vitest';
import { importContext } from '../../src/import/importContext';
import { mapAssets } from '../../src/import/mapAssets';
import { keptDelistedIds, mapPerps } from '../../src/import/mapPerps';
import type { ExportRow } from '../../src/import/readExport';
import { assetRow, perpsRow, platformRow, tradeXyzRow } from '../fixtures/import/rows';

const map = (
  markets: ExportRow[],
  platforms = [platformRow(), tradeXyzRow(), platformRow({ '*PID': '254', Name: 'Hyperliquid' })],
) => {
  const exports = { markets, platforms };
  const context = importContext(exports, {});
  return mapPerps(exports, context, mapAssets(exports, context).files);
};

describe('mapPerps', () => {
  it('merges a duplicated market id into one market with the live row facts and the lower legacy id', () => {
    const { files, unmapped } = map([
      perpsRow({ '*RWA ID': '300', Pair: 'TSLA-USDC' }),
      perpsRow({ '*RWA ID': '900', Pair: 'TSLA-USDH', Delisted: 'TRUE' }),
    ]);

    expect(files.get('perps/xyz/tsla.json')).toMatchObject({ symbol: 'TSLA', legacyId: 300, pair: 'TSLA-USDC' });
    expect(files.get('perps/xyz/tsla.json')!.events).toBeUndefined();
    expect(unmapped.filter((row) => row.column === 'Canonical Market ID')).toEqual([
      expect.objectContaining({ id: '900' }),
    ]);
  });

  it("names a merged market whose kept legacy id is a delisted twin's", () => {
    const markets = [
      perpsRow({ '*RWA ID': '300', Delisted: 'TRUE' }),
      perpsRow({ '*RWA ID': '900' }),
      perpsRow({ '*RWA ID': '301', 'Canonical Market ID': 'xyz:NVDA' }),
      perpsRow({ '*RWA ID': '901', 'Canonical Market ID': 'xyz:NVDA', Delisted: 'TRUE' }),
    ];

    expect(keptDelistedIds({ markets, platforms: [] })).toEqual([{ marketId: 'xyz:TSLA', kept: 300, live: 900 }]);
  });

  it('writes a HIP-3 dex under a hyperliquid venue, with its fees in bps and its collateral as an asset', () => {
    const { files } = map([assetRow({ '*RWA ID': '1', 'Canonical Market ID': 'USDC', Ticker: 'USDC' }), perpsRow()]);

    expect(files.get('perps/xyz/venue.json')).toMatchObject({
      slug: 'xyz',
      organization: 'trade-xyz',
      parent: 'hyperliquid',
      venueType: 'dex',
      adapter: 'hyperliquid',
      published: true,
      makerFeeBps: 1.5,
      takerFeeBps: 4.5,
    });
    expect(files.get('perps/hyperliquid/venue.json')).toMatchObject({
      organization: 'hyperliquid',
      adapter: 'hyperliquid',
    });
    expect(files.get('perps/xyz/tsla.json')).toMatchObject({ tracks: 'tesla-inc', collateral: 'usdc' });
  });

  it('gives a venue no registered adapter reads no adapter, writes it unpublished and lists it', () => {
    const flash = { 'Canonical Market ID': 'flash:TSLA', 'Parent Platform': 'Flash Trade', 'Primary Chain': 'solana' };
    const { files, unmapped } = map([perpsRow(flash)]);
    const venue = files.get('perps/flash/venue.json')!;

    expect([venue.adapter ?? null, venue.published]).toEqual([null, false]);
    expect(unmapped).toContainEqual(expect.objectContaining({ id: 'flash', reason: 'venue with no adapter' }));
  });

  it('writes a market oracle only where it differs from its venue oracle', () => {
    const { files } = map([
      perpsRow({ 'Oracle Provider': 'Pyth' }),
      perpsRow({ '*RWA ID': '2922', 'Canonical Market ID': 'xyz:AAPL', 'Oracle Provider': 'Pyth' }),
      perpsRow({ '*RWA ID': '2923', 'Canonical Market ID': 'xyz:NVDA', 'Oracle Provider': 'Chainlink' }),
    ]);

    expect([
      files.get('perps/xyz/tsla.json')!.oracleProvider,
      files.get('perps/xyz/nvda.json')!.oracleProvider,
    ]).toEqual([undefined, 'Chainlink']);
  });

  it("writes the sheet's market website, issuer and margin text on the venue, and on a market only where it differs", () => {
    const sheet = { Website: 'https://trade.xyz/', Issuer: 'XYZ', 'Margin / Settlement Asset': 'USDC (Arbitrum)' };
    const { files } = map([
      perpsRow({ ...sheet }),
      perpsRow({ ...sheet, '*RWA ID': '2922', 'Canonical Market ID': 'xyz:NVDA' }),
      perpsRow({
        ...sheet,
        '*RWA ID': '2923',
        'Canonical Market ID': 'xyz:ARM',
        Issuer: 'trade[XYZ]',
        'Margin / Settlement Asset': 'USDT',
      }),
    ]);

    expect(files.get('perps/xyz/venue.json')).toMatchObject({
      website: 'https://trade.xyz/',
      issuer: 'XYZ',
      marginAsset: 'USDC (Arbitrum)',
    });
    expect(files.get('perps/hyperliquid/venue.json')).not.toHaveProperty('issuer');
    expect(files.get('perps/xyz/tsla.json')).not.toHaveProperty('issuer');
    expect(files.get('perps/xyz/arm.json')).toMatchObject({ issuer: 'trade[XYZ]', marginAsset: 'USDT' });
    expect(files.get('perps/xyz/arm.json')).not.toHaveProperty('website');
  });

  it("keeps a market row's Logo on the market, which no venue or underlying holds", () => {
    const logo = 'https://icons.llamao.fi/icons/rwa/xyz-tsla.png';
    const { files } = map([perpsRow({ Logo: logo })]);

    expect(files.get('perps/xyz/tsla.json')!.logo).toBe(logo);
  });
});
