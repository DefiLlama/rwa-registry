/**
 * xrpl: the issuer's first Payment of the currency (of any currency for a bare issuer), walking account_tx forward from the issuer's creation; past the page cap, the issuer's first transaction as the bound.
 * @dev review: src/discover/readers/stellar.ts
 */
import { RateLimitedError, ResponseShapeError } from '../../errors';
import { xrplToken } from '../../registry/addressFamilies';
import { eachQuery, type DateReader } from '../dateReader';
import { found, missing, type Basis } from '../dateResult';
import type { DiscoverDeps } from '../discoverDeps';

const RIPPLE_EPOCH = 946684800;
// rippled's answers for a server under load, which a wait passes: https://xrpl.org/docs/references/http-websocket-apis/api-conventions/error-formatting
const BUSY = new Set(['tooBusy', 'slowDown']);

interface Entry {
  tx: {
    TransactionType: string;
    Account: string;
    Amount?: string | { currency: string; issuer: string };
    date: number;
    hash: string;
    ledger_index: number;
  };
  meta?: { AffectedNodes?: { CreatedNode?: { LedgerEntryType?: string; NewFields?: { Account?: string } } }[] };
}

interface Answer {
  result?: { status?: string; error?: string; transactions?: Entry[]; marker?: unknown };
}

// A busy server is a rate limit, named inside the pacer so the read waits and is asked again.
const accountTx = (deps: DiscoverDeps, params: Record<string, unknown>) =>
  deps.paced.xrpl(async () => {
    const { baseUrl, timeoutMs } = deps.discover.sources.xrpl;
    const { result } = await deps.clients.http.json<Answer>({
      label: 'xrpl',
      url: baseUrl,
      method: 'POST',
      body: { method: 'account_tx', params: [params] },
      timeoutMs,
    });
    if (result?.error && BUSY.has(result.error))
      throw new RateLimitedError({ source: 'xrpl', reason: 'rate-limited', message: result.error });
    if (!result || result.status !== 'success')
      throw new ResponseShapeError({ source: 'xrpl', reason: 'bad-response', message: result?.error ?? 'no result' });
    return result;
  });

const createsAccount = ({ meta }: Entry, account: string) =>
  (meta?.AffectedNodes ?? []).some(
    ({ CreatedNode }) => CreatedNode?.LedgerEntryType === 'AccountRoot' && CreatedNode.NewFields?.Account === account,
  );

// A bare issuer stands for all its codes, so its first Payment of any of them dates it.
const issues = ({ tx }: Entry, currency: string | null, issuer: string) =>
  tx.TransactionType === 'Payment' &&
  tx.Account === issuer &&
  typeof tx.Amount === 'object' &&
  (currency === null || tx.Amount.currency.toUpperCase() === currency.toUpperCase());

const dated = ({ tx }: Entry, basis: Basis) =>
  found(tx.date + RIPPLE_EPOCH, tx.ledger_index, `https://livenet.xrpl.org/transactions/${tx.hash}`, basis);

export const xrpl: DateReader = {
  family: 'xrpl',
  read: eachQuery(async ({ address }, deps) => {
    // validate has checked the form; an address it would refuse goes to the ledger whole, which answers actMalformed.
    const { currency, issuer } = xrplToken(address) ?? { currency: null, issuer: address };
    const { pageSize, maxPages } = deps.discover.sources.xrpl;
    let marker: unknown;
    let first: Entry | undefined;
    for (let page = 0; page < maxPages; page++) {
      const params = { account: issuer, forward: true, limit: pageSize, ledger_index_min: -1, ledger_index_max: -1 };
      const result = await accountTx(deps, { ...params, api_version: 1, ...(marker ? { marker } : {}) });
      const entries = result.transactions ?? [];
      if (page === 0) {
        first = entries[0];
        if (!first || !createsAccount(first, issuer)) return missing('history-truncated', `account_tx ${issuer}`);
      }
      const issue = entries.find((entry) => issues(entry, currency, issuer));
      if (issue) return dated(issue, 'first-issue');
      marker = result.marker;
      if (!marker) break;
    }
    return dated(first!, 'issuer-first-transaction');
  }),
};
