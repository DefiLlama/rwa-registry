import { describe, expect, it } from 'vitest';
import { chainOf, normalizeAddress } from '../../src/import/normalizeAddress';

const EVM = '0xAbC0000000000000000000000000000000000DeF';
const ISSUER = 'GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6';

describe('normalizeAddress', () => {
  it('maps the chain aliases and the merged spellings onto one slug and lowercases evm addresses', () => {
    expect(
      [
        `Monad:${EVM}`,
        `plume_mainnet:${EVM}`,
        `hyperliquid:${EVM}`,
        `hyperevm:${EVM}`,
        `gnosis:${EVM}`,
        `zksync:${EVM}`,
        `bera:${EVM}`,
        `bnb:${EVM}`,
        `b2-mainnet:${EVM}`,
      ].map((item) => normalizeAddress(item)),
    ).toEqual(
      ['monad', 'plume', 'hyperliquid', 'hyperliquid', 'xdai', 'era', 'berachain', 'bsc', 'bsquared'].map((chain) => ({
        chain,
        family: 'evm',
        address: EVM.toLowerCase(),
      })),
    );
  });

  it.each([
    [
      'pads a Move address to 64 digits and keeps its type tag',
      'aptos:0x1::usdy::USDY',
      `0x${'0'.repeat(63)}1::usdy::USDY`,
    ],
    ['strips the -1 suffix of a Stellar classic asset', `stellar:USDY-${ISSUER}-1`, `USDY-${ISSUER}`],
    ['keeps a Cosmos bank denom as written', 'axelar:cusd-wei', 'cusd-wei'],
  ])('%s', (_, item, address) => {
    expect(normalizeAddress(item)).toMatchObject({ address });
  });

  it('keeps an XRPL item as the sheet writes it, a bare issuer included, and rejects one with no issuer', () => {
    for (const address of [
      'AERO:rGXjYgKrqTUZTPF9pMEKPTJEpcHE41wCE7',
      'DIA-SD-COL1.rDgoZHy4SLPs4jhJZqkyaXX4iEsEUkCAVp',
      'EURS-rs5hzzF7RzdV2Ub7Fv14Z1ShjuCrnL7FEX',
      'rK67JczCpaYXVtfw3qJVmqwpSfa1bYTptw',
    ]) {
      expect(normalizeAddress(`ripple:${address}`)).toEqual({ chain: 'ripple', family: 'xrpl', address });
    }
    expect(normalizeAddress('xrpl:AERO')).toMatchObject({ reason: expect.any(String) });
  });

  it('never guesses a malformed item', () => {
    expect(normalizeAddress('ethereum:0x123')).toEqual({ reason: 'not a valid evm address: 0x123' });
  });

  it('keeps hyperliquid as HyperCore outside contract items', () => {
    expect(chainOf('hyperliquid', 'chain')).toMatchObject({ slug: 'hyperliquid' });
    expect(chainOf('arbitrum_nova', 'chain')).toMatchObject({ slug: 'arbitrum-nova', family: 'evm' });
  });
});
