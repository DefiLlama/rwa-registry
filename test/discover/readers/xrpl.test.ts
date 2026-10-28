import { describe, expect, it, vi } from 'vitest';
import type { DateQuery } from '../../../src/discover/dateReader';
import { xrpl } from '../../../src/discover/readers/xrpl';
import { shouldBehaveLikeDateReader } from '../../behaviours/shouldBehaveLikeDateReader';
import { answering, fakeDiscoverDeps } from '../../fakes/discover';

const ISSUER = 'rHuiXXjHLpMP8ZE9sSQU5aADQVWDwv6h5p';
const OUSG = '4F55534700000000000000000000000000000000';
const query: DateQuery = { chain: 'ripple', chainId: 'ripple', family: 'xrpl', address: `${OUSG}.${ISSUER}` };
// 2025-06-30 00:00 UTC in seconds since the XRPL epoch.
const DAY = 1751241600 - 946684800;

const entry = (type: string, day: number, extra: Record<string, unknown> = {}, meta = {}) => ({
  tx: {
    TransactionType: type,
    Account: ISSUER,
    date: DAY + day * 86400,
    hash: `h${day}`,
    ledger_index: 90 + day,
    ...extra,
  },
  meta,
});
const creation = {
  AffectedNodes: [{ CreatedNode: { LedgerEntryType: 'AccountRoot', NewFields: { Account: ISSUER } } }],
};
const answer = (transactions: unknown[]) => answering(() => ({ result: { status: 'success', transactions } }));

describe('xrpl date reader', () => {
  shouldBehaveLikeDateReader(xrpl, [query, { ...query, address: `USD.${ISSUER}` }]);

  it("dates the issuer's first Payment of the currency", async () => {
    const http = answer([
      entry('Payment', 0, { Account: 'rFunder', Amount: '5000000' }, creation),
      entry('AccountSet', 1),
      entry('Payment', 2, { Amount: { currency: OUSG, issuer: ISSUER, value: '1' } }),
    ]);
    const [result] = await xrpl.read([query], fakeDiscoverDeps({ http }));

    expect(result).toMatchObject({ date: '2025-07-02', block: 92, basis: 'first-issue' });
  });

  it("answers history-truncated when the first page does not hold the issuer's creation", async () => {
    const [result] = await xrpl.read([query], fakeDiscoverDeps({ http: answer([entry('AccountSet', 1)]) }));

    expect(result).toMatchObject({ date: null, reason: 'history-truncated' });
  });

  it("falls back to the issuer's first transaction as the bound when no issue is found", async () => {
    const http = answer([entry('Payment', 0, { Account: 'rFunder', Amount: '5000000' }, creation)]);
    const [result] = await xrpl.read([query], fakeDiscoverDeps({ http }));

    expect(result).toMatchObject({ date: '2025-06-30', basis: 'issuer-first-transaction' });
  });

  it('waits and asks again when the server answers tooBusy, then dates the answer', async () => {
    let calls = 0;
    const http = answering(() =>
      ++calls === 1
        ? { result: { status: 'error', error: 'tooBusy' } }
        : { result: { status: 'success', transactions: [entry('Payment', 0, { Account: 'rFunder' }, creation)] } },
    );
    const [result] = await xrpl.read([query], fakeDiscoverDeps({ http }));

    expect(vi.mocked(http.json)).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ date: '2025-06-30', basis: 'issuer-first-transaction' });
  });

  it('answers rate-limited when the server stays busy, and bad-response for another error', async () => {
    const busy = answering(() => ({ result: { status: 'error', error: 'tooBusy' } }));
    const broken = answering(() => ({ result: { status: 'error', error: 'actMalformed' } }));
    const [stillBusy] = await xrpl.read([query], fakeDiscoverDeps({ http: busy }));
    const [malformed] = await xrpl.read([query], fakeDiscoverDeps({ http: broken }));

    expect(stillBusy).toMatchObject({ date: null, reason: 'rate-limited' });
    expect(malformed).toMatchObject({ date: null, reason: 'bad-response', detail: 'xrpl: actMalformed' });
  });

  it('dates a code as the sheet writes it by its ledger form, and a bare issuer by its first Payment of any code', async () => {
    const http = answer([
      entry('AccountSet', 1, {}, creation),
      entry('Payment', 2, { Amount: { currency: 'USD', issuer: ISSUER, value: '1' } }),
      entry('Payment', 3, { Amount: { currency: OUSG, issuer: ISSUER, value: '1' } }),
    ]);
    const [written, bare] = await xrpl.read(
      [
        { ...query, address: `OUSG:${ISSUER}` },
        { ...query, address: ISSUER },
      ],
      fakeDiscoverDeps({ http }),
    );

    expect(written).toMatchObject({ date: '2025-07-03', basis: 'first-issue' });
    expect(bare).toMatchObject({ date: '2025-07-02', basis: 'first-issue' });
  });
});
