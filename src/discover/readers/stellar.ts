/**
 * stellar: a classic asset's first issue from Horizon while it holds the issuer's creation, else the first ledger stellar.expert records.
 * @dev review: src/discover/readers/xrpl.ts
 */
import { eachQuery, type DateReader } from '../dateReader';
import { found, missing, type DateResult } from '../dateResult';
import { askJson, type DiscoverDeps } from '../discoverDeps';

const CONTRACT = /^C[A-Z2-7]{55}$/;

interface Operation {
  id: string;
  type: string;
  created_at: string;
  asset_code?: string;
  asset_issuer?: string;
  asset?: string;
  from?: string;
}

interface Page {
  _embedded?: { records?: Operation[] };
  _links?: { next?: { href?: string } };
}

const issues = (operation: Operation, code: string, issuer: string) =>
  operation.type === 'create_claimable_balance'
    ? operation.asset === `${code}:${issuer}`
    : (operation.type === 'payment' || operation.type.startsWith('path_payment')) &&
      operation.asset_code === code &&
      operation.asset_issuer === issuer &&
      operation.from === issuer;

// Horizon keeps history from its elder ledger only, so a first page that does not open with create_account is cut.
const firstIssue = async (code: string, issuer: string, deps: DiscoverDeps): Promise<DateResult | null> => {
  const { baseUrl, pageSize, maxPages } = deps.discover.sources.horizon;
  let url = `${baseUrl}/accounts/${issuer}/operations?order=asc&limit=${pageSize}`;
  for (let page = 0; page < maxPages; page++) {
    const body = await askJson<Page>(deps, 'horizon', { label: 'horizon', url });
    const records = body._embedded?.records ?? [];
    if (page === 0 && records[0]?.type !== 'create_account') return null;
    const issue = records.find((operation) => issues(operation, code, issuer));
    if (issue)
      return found(Date.parse(issue.created_at) / 1000, null, `${baseUrl}/operations/${issue.id}`, 'first-issue');
    const next = body._links?.next?.href;
    if (records.length < pageSize || !next) return null;
    url = next;
  }
  return null;
};

const expertCreated = async (kind: 'asset' | 'contract', id: string, deps: DiscoverDeps): Promise<DateResult> => {
  const url = `${deps.discover.sources.stellarExpert.baseUrl}/${kind}/${id}`;
  const body = await askJson<{ created?: number }>(deps, 'stellarExpert', { label: 'stellar.expert', url });
  return typeof body.created === 'number'
    ? found(body.created, null, url, kind === 'asset' ? 'asset-created' : 'contract-created')
    : missing('not-found', url);
};

export const stellar: DateReader = {
  family: 'stellar',
  read: eachQuery(async ({ address }, deps) => {
    if (CONTRACT.test(address)) return expertCreated('contract', address, deps);
    const [code, issuer] = address.split('-');
    return (await firstIssue(code, issuer, deps)) ?? expertCreated('asset', address, deps);
  }),
};
