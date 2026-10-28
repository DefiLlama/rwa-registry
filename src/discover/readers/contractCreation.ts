/**
 * contractCreation: the getcontractcreation route that Etherscan and Blockscout explorers share, several addresses a call; a body that refuses the chain comes back as the refusal's message.
 * @dev review: src/discover/readers/evm.ts
 */
import { RateLimitedError } from '../../errors';
import type { DateQuery } from '../dateReader';
import { found, missing, type DateResult } from '../dateResult';
import type { DiscoverDeps } from '../discoverDeps';

export interface CreationApi {
  source: 'etherscan' | 'blockscout';
  url: string;
  // The parameters beyond the route's own, such as chainid and apikey; none of them reaches a result's source.
  query: Record<string, string | number>;
  shown: Record<string, string | number>;
}

interface Creation {
  contractAddress: string;
  blockNumber: string;
  timestamp: string;
}

interface Answer {
  status: string;
  message: string;
  result: Creation[] | string | null;
}

// Both answer HTTP 200 with status 0 for a rate limit, an unknown address and an uncovered chain alike.
const RATE_LIMITED = /rate limit/i;
const NO_DATA = /no data found/i;

const sourceOf = ({ url, shown }: CreationApi, address: string) => {
  const lead = Object.entries(shown).map(([key, value]) => `${key}=${value}&`);
  return `${url}?${lead.join('')}module=contract&action=getcontractcreation&contractaddresses=${address}`;
};

export const contractCreations = async (
  api: CreationApi,
  batch: DateQuery[],
  deps: DiscoverDeps,
): Promise<DateResult[] | { refused: string }> => {
  const answer = await deps.paced[api.source](async () => {
    const body = await deps.clients.http.json<Answer>({
      label: api.source,
      url: api.url,
      timeoutMs: deps.discover.sources[api.source].timeoutMs,
      query: {
        ...api.query,
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: batch.map(({ address }) => address).join(','),
      },
    });
    const message = typeof body.result === 'string' ? body.result : body.message;
    if (body.status !== '1' && RATE_LIMITED.test(message))
      throw new RateLimitedError({ source: api.source, reason: 'rate-limited', message });
    return body;
  });
  if (answer.status !== '1') {
    if (NO_DATA.test(answer.message)) return batch.map(({ address }) => missing('not-found', sourceOf(api, address)));
    return { refused: typeof answer.result === 'string' ? answer.result : answer.message };
  }
  const rows = Array.isArray(answer.result) ? answer.result : [];
  const byAddress = new Map(rows.map((row) => [row.contractAddress.toLowerCase(), row]));
  return batch.map(({ address }) => {
    const row = byAddress.get(address.toLowerCase());
    const source = sourceOf(api, address);
    return row
      ? found(Number(row.timestamp), Number(row.blockNumber), source, 'contract-creation')
      : missing('not-found', source);
  });
};
