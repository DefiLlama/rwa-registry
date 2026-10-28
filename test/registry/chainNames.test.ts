import { describe, expect, it } from 'vitest';
import { chainIdOf } from '../../src/registry';

describe('chainIdOf', () => {
  it("reads the sdk key first, so a merged alias is never the chain id, then an underscored alias, then the slug", () => {
    expect(chainIdOf({ slug: 'avax', aliases: ['avalanche'], sdkKey: 'avax' })).toBe('avax');
    expect(chainIdOf({ slug: 'hyperliquid', aliases: ['hyperevm'], sdkKey: 'hyperliquid' })).toBe('hyperliquid');
    expect(chainIdOf({ slug: 'acala-evm', sdkKey: 'acala' })).toBe('acala');
    expect(chainIdOf({ slug: 'ripple', aliases: ['xrpl'] })).toBe('ripple');
    expect(chainIdOf({ slug: 'boba-moonbeam', aliases: ['boba_moonbeam'] })).toBe('boba_moonbeam');
  });
});

