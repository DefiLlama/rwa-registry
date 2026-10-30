import { describe, expect, it, vi } from 'vitest';
import type { DateQuery } from '../../../src/discover/dateReader';
import { ton } from '../../../src/discover/readers/ton';
import { HttpStatusError } from '../../../src/errors';
import { answering, discoverConfig, fakeDiscoverDeps } from '../../fakes/discover';

const USDE = 'EQAIb6KmdfdDR7CN1GBqVJuP25iCnLKCvBlJ07Evuu2dzP5f';
const query: DateQuery = { chain: 'ton', address: USDE };
const HASH = 'KiIr2kGMZ/S0rDMGryIz01YKK16BLXN2wv3tIf1c9Y0=';
const tx = (now: number, orig: string, end: string, hash = HASH) => ({
  now,
  hash,
  mc_block_seqno: 44700631,
  orig_status: orig,
  end_status: end,
});

describe('ton date reader', () => {
  it('dates a jetton master at its first active transaction, after a transfer to the address before it existed', async () => {
    const http = answering(() => ({
      transactions: [tx(1738800000, 'nonexist', 'uninit', 'AAAA'), tx(1738894087, 'uninit', 'active')],
    }));
    const [result] = await ton.read([query], fakeDiscoverDeps({ http }));
    const [request] = vi.mocked(http.json).mock.calls[0]!;

    expect(request).toMatchObject({ query: { account: USDE, sort: 'asc', limit: 10 } });
    expect(result).toMatchObject({ date: '2025-02-07', block: 44700631, basis: 'first-transaction' });
    expect(result.source).toBe(`https://tonviewer.com/transaction/${Buffer.from(HASH, 'base64').toString('hex')}`);
  });

  it('answers not-found for an account with no transaction, and page-cap when a full page never turns active', async () => {
    const empty = answering(() => ({ transactions: [] }));
    const inactive = answering(() => ({
      transactions: Array.from({ length: 10 }, (_, index) => tx(1738800000 + index, 'nonexist', 'uninit')),
    }));
    const [none] = await ton.read([query], fakeDiscoverDeps({ http: empty }));
    const [capped] = await ton.read([query], fakeDiscoverDeps({ http: inactive }));

    expect(none).toMatchObject({ date: null, reason: 'not-found' });
    expect(capped).toMatchObject({ date: null, reason: 'page-cap' });
  });

  it('answers an address toncenter cannot parse as not-found with the status, never a date', async () => {
    const http = answering(() =>
      Promise.reject(new HttpStatusError({ source: 'toncenter', reason: 'http-error', message: 'HTTP 422' })),
    );
    const [result] = await ton.read([query], fakeDiscoverDeps({ http }));

    expect(result).toMatchObject({ date: null, reason: 'not-found', detail: expect.stringContaining('HTTP 422') });
  });

  it('sends the toncenter key as a header only when TONCENTER_API_KEY is set', async () => {
    const http = answering(() => ({ transactions: [tx(1738894087, 'nonexist', 'active')] }));
    await ton.read([query], fakeDiscoverDeps({ http }));
    await ton.read([query], fakeDiscoverDeps({ http }, discoverConfig({ TONCENTER_API_KEY: 'test-key' })));
    const [unkeyed, keyed] = vi.mocked(http.json).mock.calls.map(([request]) => request.headers);

    expect(unkeyed).toBeUndefined();
    expect(keyed).toEqual({ 'X-Api-Key': 'test-key' });
  });
});
