/**
 * solana: a mint's day from Solscan's created_time, else its oldest signature, else, past the page cap, its Metaplex metadata account's.
 * @dev review: src/clients/rpc/creation.ts, src/discover/readers/alchemy.ts, src/discover/discoverDates.ts
 */
import type { Signature } from '../../clients/rpc/creation';
import { HttpStatusError } from '../../errors';
import { eachQuery, type DateQuery, type DateReader } from '../dateReader';
import { found, missing, type DateResult } from '../dateResult';
import { askJson, type DiscoverDeps } from '../discoverDeps';
import { alchemyCall, alchemyUrl } from './alchemy';
import { METADATA_PROGRAM, metadataAddress } from './solanaAddress';

interface TokenMeta {
  success?: boolean;
  data?: { created_time?: number | null } | null;
}

// A key the plan refuses (HTTP 401 or 403) holds for the whole run, so Solscan is named once and the walk answers.
const REFUSED = /HTTP 40[13]$/;
const refusals = new WeakSet<DiscoverDeps>();

// null leaves the mint to the signature walk: no key, a refused key, no time in the answer, or a failed read.
const createdTime = async (address: string, deps: DiscoverDeps): Promise<DateResult | null> => {
  const { baseUrl, apiKey } = deps.discover.sources.solscan;
  if (!apiKey || refusals.has(deps)) return null;
  const body = await askJson<TokenMeta>(deps, 'solscan', {
    label: 'solscan',
    url: `${baseUrl}/token/meta`,
    query: { address },
    headers: { token: apiKey },
  }).catch((error: unknown) => {
    if (error instanceof HttpStatusError && REFUSED.test(error.message) && !refusals.has(deps)) {
      refusals.add(deps);
      deps.log(
        `solscan refused the key (${error.message}): Solana mints go to the signature walk for the rest of this run`,
      );
    }
    return null;
  });
  const time = body?.data?.created_time;
  return typeof time === 'number' && time > 0
    ? found(time, null, `https://solscan.io/token/${address}`, 'created-time')
    : null;
};

type Page = (before: string | null, limit: number) => Promise<Signature[]>;

const pagesOf = ({ chain }: DateQuery, address: string, deps: DiscoverDeps): Page => {
  const url = alchemyUrl(deps, chain);
  if (!url)
    return (before, limit) =>
      deps.paced.solana(() => deps.clients.rpc.solanaSignatures({ chain, address, before, limit }));
  return async (before, limit) => {
    const rows = await alchemyCall<Signature[] | null>(
      deps,
      url,
      'getSignaturesForAddress',
      [address, before ? { limit, before } : { limit }],
      'solana',
    );
    return (rows ?? []).map(({ signature, slot, blockTime }) => ({ signature, slot, blockTime: blockTime ?? null }));
  };
};

// The walk of one address back to its oldest signature, capped at this run's pages.
const walk = async (page: Page, deps: DiscoverDeps) => {
  const { pageSize, pagesPerRun } = deps.discover.sources.solana;
  let before: string | null = null;
  let oldest: Signature | undefined;
  for (let read = 0; read < pagesPerRun; read++) {
    const rows = await page(before, pageSize);
    oldest = rows.at(-1) ?? oldest;
    if (rows.length < pageSize) return { oldest, capped: false };
    before = oldest!.signature;
  }
  return { oldest, capped: true };
};

const dated = (oldest: Signature, basis: 'first-signature' | 'metadata-created'): DateResult => {
  const source = `https://explorer.solana.com/tx/${oldest.signature}`;
  return oldest.blockTime === null
    ? missing('history-unreadable', source)
    : found(oldest.blockTime, oldest.slot, source, basis);
};

const ownerOf = async ({ chain }: DateQuery, address: string, deps: DiscoverDeps): Promise<string | null> => {
  const url = alchemyUrl(deps, chain);
  if (!url) return deps.paced.solana(() => deps.clients.rpc.solanaOwner({ chain, address }));
  const read = await alchemyCall<{ value: { owner?: string } | null }>(
    deps,
    url,
    'getAccountInfo',
    [address, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }],
    'solana',
  );
  return read.value?.owner ?? null;
};

// null when no metadata account lives at the address (a Token-2022 mint keeps its metadata inside the mint), when its history outruns the pages, or on a failed read.
// A missing account still collects signatures from transactions that only name the address, so only an account the metadata program owns is walked.
const metadataCreated = async (query: DateQuery, deps: DiscoverDeps): Promise<DateResult | null> => {
  const address = metadataAddress(query.address);
  if ((await ownerOf(query, address, deps)) !== METADATA_PROGRAM) return null;
  const { oldest, capped } = await walk(pagesOf(query, address, deps), deps);
  return oldest && !capped ? dated(oldest, 'metadata-created') : null;
};
const metadataOrNull = (query: DateQuery, deps: DiscoverDeps) => metadataCreated(query, deps).catch(() => null);

export const solana: DateReader = {
  family: 'solana',
  read: eachQuery(async (query, deps) => {
    const { address } = query;
    const created = await createdTime(address, deps);
    if (created) return created;
    const { oldest, capped } = await walk(pagesOf(query, address, deps), deps);
    if (!capped)
      return oldest ? dated(oldest, 'first-signature') : missing('not-found', `getSignaturesForAddress ${address}`);
    const metadata = await metadataOrNull(query, deps);
    if (metadata) return metadata;
    const { pageSize, pagesPerRun } = deps.discover.sources.solana;
    return missing(
      'page-cap',
      `getSignaturesForAddress ${address}: over ${pagesPerRun * pageSize} signatures this run`,
    );
  }),
};
