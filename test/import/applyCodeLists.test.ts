import { describe, expect, it } from 'vitest';
import { applyCodeLists } from '../../src/import/applyCodeLists';
import type { FileJson, RegistryFiles } from '../../src/import/importTypes';

// One row per list the server keeps: chains, the flagged vocabularies, excluded tickers, the mcap basis, the acks.
const listed = (): RegistryFiles =>
  new Map<string, FileJson | FileJson[]>([
    ['reference/chains/ethereum.json', { slug: 'ethereum', label: 'ethereum', addressFamily: 'evm' }],
    ['reference/chains/solana.json', { slug: 'solana', label: 'solana', addressFamily: 'solana' }],
    ['reference/chains/sui.json', { slug: 'sui', label: 'sui', addressFamily: 'sui' }],
    [
      'reference/vocabularies/category.json',
      [
        { slug: 'governance-tokens', label: 'Governance Tokens' },
        { slug: 'rwa-stablecoins', label: 'RWA Stablecoins' },
        { slug: 'stocks-equities', label: 'Stocks & Equities' },
      ],
    ],
    [
      'reference/vocabularies/rwa-classification.json',
      [{ slug: 'non-rwa-gov-utility', label: 'Non-RWA (Gov/Utility)' }],
    ],
    ['reference/vocabularies/revenue-confidence.json', [{ slug: 'public-filings', label: 'Public Filings' }]],
    ['reference/vocabularies/currency.json', [{ slug: 'usd', label: 'USD' }]],
    ['reference/underlyings/bitcoin.json', { slug: 'bitcoin', name: 'Bitcoin', ticker: 'BTC', class: 'crypto' }],
    [
      'reference/underlyings/seagate.json',
      { slug: 'seagate', name: 'Seagate Technology', ticker: 'STX', class: 'equity' },
    ],
    ['assets/xstocks/platform.json', { slug: 'xstocks', name: 'xStocks', kind: 'platform' }],
    ['assets/transfero/brz.json', { slug: 'brz', legacyId: 609 }],
    ['assets/sygnum/fiusd.json', { slug: 'fiusd', legacyId: 94 }],
  ]);

describe('applyCodeLists', () => {
  it('writes each server code list into the field that holds it', () => {
    const { files: out } = applyCodeLists(listed());
    const at = (path: string) => out.get(path) as FileJson;
    const vocabulary = (name: string) => out.get(`reference/vocabularies/${name}.json`) as FileJson[];

    expect(at('reference/chains/ethereum.json')).toMatchObject({
      label: 'Ethereum',
      caip2: 'eip155:1',
      burnAddresses: ['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead'],
    });
    expect(at('reference/chains/solana.json').burnAddresses).toEqual(['1nc1nerator11111111111111111111111111111111']);
    expect(at('reference/chains/sui.json').burnAddresses).toBeUndefined();
    expect(vocabulary('category')).toEqual([
      { slug: 'governance-tokens', label: 'Governance Tokens', impliesGovernance: true },
      { slug: 'rwa-stablecoins', label: 'RWA Stablecoins', impliesStablecoin: true },
      { slug: 'stocks-equities', label: 'Stocks & Equities' },
    ]);
    expect(vocabulary('rwa-classification')[0].impliesGovernance).toBe(true);
    expect(vocabulary('revenue-confidence')[0].estimateRevenue).toBe(true);
    expect(vocabulary('currency').map((value) => value.slug)).toHaveLength(26);
    expect(at('reference/underlyings/bitcoin.json').excludedReason).toBe('crypto ticker (CRYPTO_TICKERS)');
    expect(at('reference/underlyings/seagate.json').excludedReason).toBeUndefined();
    expect(at('assets/xstocks/platform.json').onchainMcapBasis).toBe('active');
    expect(at('../acks/brz-flows.json')).toMatchObject({ slug: 'brz-flows', guard: 'flows-hidden', asset: 'brz' });
    expect(at('../acks/fiusd-asset-move.json')).toMatchObject({
      guard: 'asset-move',
      asset: 'fiusd',
      from: '2026-09-03',
    });
  });

  it("writes each chain's sdk key from the sdk's own list, and none where the sdk serves the chain by no name", () => {
    const chain = (slug: string, fields: FileJson = {}): [string, FileJson] => [
      `reference/chains/${slug}.json`,
      { slug, label: slug, addressFamily: 'evm', ...fields },
    ];
    const { files: out } = applyCodeLists(
      new Map([
        chain('xdai', { aliases: ['gnosis'] }),
        chain('klaytn', { aliases: ['kaia'] }),
        chain('polygon-zkevm', { aliases: ['polygon_zkevm'] }),
        chain('acala-evm'),
        chain('solana', { addressFamily: 'solana' }),
        chain('ripple', { aliases: ['xrpl'], addressFamily: 'xrpl' }),
        chain('story'),
      ]),
    );

    expect([...out.values()].map((file) => [(file as FileJson).slug, (file as FileJson).sdkKey])).toEqual([
      ['xdai', 'xdai'],
      ['klaytn', 'klaytn'],
      ['polygon-zkevm', 'polygon_zkevm'],
      ['acala-evm', 'acala'],
      ['solana', 'solana'],
      ['ripple', undefined],
      ['story', 'sty'],
    ]);
  });

  it("labels a chain with the server's display name of its sdk key where the export spelling is no DefiLlama id", () => {
    const chain = (slug: string): [string, FileJson] => [
      `reference/chains/${slug}.json`,
      { slug, label: slug, addressFamily: 'evm' },
    ];
    const { files: out } = applyCodeLists(
      new Map(['acala-evm', 'astar-zk-evm', 'cronos-zk-evm', 'plume', 'story'].map(chain)),
    );

    expect([...out.values()].map((file) => (file as FileJson).label)).toEqual([
      'Acala',
      'Astar zkEVM',
      'Cronos zkEVM',
      'Plume Mainnet',
      'Data Network',
    ]);
  });

  it("gives the server's unreleased reserve holders their label kind and leaves every other holder excluded", () => {
    const treasury = '0x5754284f345afc66a98fbb0a0afe71e0f007b949';
    const other = `0x${'1'.repeat(40)}`;
    const { files: out } = applyCodeLists(
      new Map([
        [
          'assets/tether/usdt.json',
          {
            slug: 'usdt',
            coingeckoId: 'tether',
            deployments: [
              {
                chain: 'ethereum',
                address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
                labels: [
                  { address: treasury, kind: 'excluded-holder' },
                  { address: other, kind: 'excluded-holder' },
                ],
              },
              {
                chain: 'tron',
                address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                labels: [{ address: treasury, kind: 'excluded-holder' }],
              },
            ],
          },
        ],
        [
          'assets/tether/cnht.json',
          {
            slug: 'cnht',
            deployments: [
              { chain: 'ethereum', address: other, labels: [{ address: treasury, kind: 'excluded-holder' }] },
            ],
          },
        ],
      ]),
    );
    const kinds = (path: string) =>
      ((out.get(path) as FileJson).deployments as FileJson[]).flatMap((row) =>
        (row.labels as FileJson[]).map((label) => label.kind),
      );

    expect(kinds('assets/tether/usdt.json')).toEqual(['reserve-unreleased', 'excluded-holder', 'excluded-holder']);
    expect(kinds('assets/tether/cnht.json')).toEqual(['excluded-holder']);
  });
});
