/**
 * ton: a jetton master's deployment as the account's first transaction that leaves it active, from toncenter's indexed v3 API; the key is optional.
 * @dev review: src/discover/readers/tron.ts
 */
import { HttpStatusError } from '../../errors';
import { eachQuery, type DateReader } from '../dateReader';
import { found, missing } from '../dateResult';
import { askJson } from '../discoverDeps';

interface Transaction {
  now: number;
  hash: string;
  mc_block_seqno?: number | null;
  end_status?: string;
}

// toncenter answers 422 for an address it cannot parse, which a later run reads the same way.
const UNREADABLE = /HTTP 4(00|22)$/;

const viewerOf = (hash: string) => `https://tonviewer.com/transaction/${Buffer.from(hash, 'base64').toString('hex')}`;

export const ton: DateReader = {
  family: 'ton',
  read: eachQuery(async ({ address }, deps) => {
    const { baseUrl, apiKey, pageSize } = deps.discover.sources.toncenter;
    const url = `${baseUrl}/transactions`;
    const listed = `${url}?account=${address}&sort=asc`;
    const body = await askJson<{ transactions?: Transaction[] }>(deps, 'toncenter', {
      label: 'toncenter',
      url,
      query: { account: address, sort: 'asc', limit: pageSize, offset: 0 },
      ...(apiKey ? { headers: { 'X-Api-Key': apiKey } } : {}),
    }).catch((error: unknown) => {
      if (error instanceof HttpStatusError && UNREADABLE.test(error.message))
        return { unreadable: `${error.message}: toncenter cannot read the address` };
      throw error;
    });
    if ('unreadable' in body) return missing('not-found', listed, { detail: body.unreadable });
    const rows = body.transactions ?? [];
    // A transfer can reach an address before its contract exists, so the deployment is the first to leave it active.
    const deployed = rows.find((row) => row.end_status === 'active');
    if (deployed)
      return found(deployed.now, deployed.mc_block_seqno ?? null, viewerOf(deployed.hash), 'first-transaction');
    if (!rows.length) return missing('not-found', listed);
    return rows.length < pageSize ? missing('no-code', listed) : missing('page-cap', listed);
  }),
};
