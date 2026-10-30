import { describe, expect, it, vi } from 'vitest';
import { loadDiscoverConfig } from '../../src/discover/discoverConfig';
import { askJson, buildDiscoverDeps } from '../../src/discover/discoverDeps';
import { answering, fakeDiscoverDeps } from '../fakes/discover';

describe('discoverDeps', () => {
  it("asks a source with the timeout its config names, not the http client's default", async () => {
    const http = answering(() => ({}));
    const deps = fakeDiscoverDeps({ http });
    await askJson(deps, 'tronscan', { label: 'tronscan', url: 'https://tronscan.example/contract' });

    expect(vi.mocked(http.json).mock.calls[0]![0].timeoutMs).toBe(deps.discover.sources.tronscan.timeoutMs);
  });

  it('names each missing key once, with what answers instead', () => {
    const log = vi.fn();
    buildDiscoverDeps({}, log);
    const lines = log.mock.calls.map((call) => String(call[0]));

    expect(lines.map((line) => line.split(' ')[0])).toEqual([
      'ETHERSCAN_API_KEY',
      'ALCHEMY_KEY',
      'SOLSCAN_API_KEY',
      'TONCENTER_API_KEY',
      'PRO_API_KEY',
    ]);
    expect(lines.every((line) => / is not set: /.test(line))).toBe(true);
  });

  it('reads every key placeholder of the discover sources from the env, and leaves a missing one null', () => {
    const { sources, http, venues } = loadDiscoverConfig({
      ALCHEMY_KEY: 'a-key',
      TONCENTER_API_KEY: 't-key',
      SOLSCAN_API_KEY: 's-key',
      PRO_API_KEY: 'p-key',
    });

    expect(sources.alchemy.apiKey).toBe('a-key');
    expect(sources.toncenter.apiKey).toBe('t-key');
    expect(sources.solscan.apiKey).toBe('s-key');
    expect(sources.history.apiKey).toBe('p-key');
    expect(sources.etherscan.apiKey).toBeNull();
    expect([http.timeoutMs > 0, venues.binance?.urls.api.startsWith('https://')]).toEqual([true, true]);
  });
});
