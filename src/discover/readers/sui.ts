/**
 * sui: the publish of a coin type's package, read as the package object's previous transaction and that transaction's time.
 * @dev review: src/discover/readers/aptos.ts
 */
import { eachQuery, type DateReader } from '../dateReader';
import { found, missing } from '../dateResult';
import { askJson, type DiscoverDeps } from '../discoverDeps';

const call = <T>(deps: DiscoverDeps, method: string, params: unknown[]) =>
  askJson<{ result?: T }>(deps, 'sui', {
    label: 'sui',
    url: deps.discover.sources.sui.baseUrl,
    method: 'POST',
    body: { jsonrpc: '2.0', id: 1, method, params },
  });

export const sui: DateReader = {
  family: 'sui',
  read: eachQuery(async ({ address }, deps) => {
    const pkg = address.split('::')[0];
    const object = await call<{ data?: { previousTransaction?: string } }>(deps, 'sui_getObject', [
      pkg,
      { showPreviousTransaction: true },
    ]);
    const digest = object.result?.data?.previousTransaction;
    if (!digest) return missing('not-found', `sui_getObject ${pkg}`);
    const tx = await call<{ timestampMs?: string; checkpoint?: string }>(deps, 'sui_getTransactionBlock', [digest, {}]);
    const source = `https://suiscan.xyz/mainnet/tx/${digest}`;
    const ms = Number(tx.result?.timestampMs);
    return found(ms / 1000, tx.result?.checkpoint ? Number(tx.result.checkpoint) : null, source, 'package-published');
  }),
};
