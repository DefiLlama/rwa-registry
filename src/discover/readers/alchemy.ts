/**
 * alchemy: a chain's keyed Alchemy node, built from the ALCHEMY_KEY placeholder and the chain's subdomain in config, and one JSON-RPC call through the alchemy pacer.
 * @dev review: src/discover/readers/firstCode.ts, src/discover/readers/solana.ts
 */
import { ClientError, RateLimitedError, ResponseShapeError } from '../../errors';
import type { DiscoverDeps } from '../discoverDeps';

interface Answer<T> {
  result?: T;
  error?: { code?: number; message?: string };
}

const LABEL = 'alchemy';
const RATE_LIMITED = /rate limit|capacity|too many/i;
// Compute units over the 20 of eth_getCode and eth_getBlockByNumber, which the pacer's gap is set for (alchemy.com/docs/reference/compute-unit-costs).
const WEIGHT: Record<string, number> = { eth_blockNumber: 0.5 };

// null when the key is missing or the chain has no subdomain, so the caller asks the public node.
export const alchemyUrl = (deps: DiscoverDeps, chain: string): string | null => {
  const { baseUrl, apiKey, subdomains } = deps.discover.sources.alchemy;
  const subdomain = subdomains[chain];
  return apiKey && subdomain ? `${baseUrl.replace('{subdomain}', subdomain)}/${apiKey}` : null;
};

// The node answers HTTP 200 with an error object, so the error is named inside the pacer and a rate limit is retried.
// pacer: Solana's pages, which take seconds each, wait in the solana pacer, so they never hold the slots of the EVM code search; the two gaps share the key's budget.
export const alchemyCall = <T>(
  deps: DiscoverDeps,
  url: string,
  method: string,
  params: unknown[],
  pacer: 'alchemy' | 'solana' = 'alchemy',
): Promise<T> =>
  deps.paced[pacer](async () => {
    const body = await deps.clients.http.json<Answer<T>>({
      label: LABEL,
      url,
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method, params },
      timeoutMs: deps.discover.sources.alchemy.timeoutMs,
    });
    if (body.error) {
      const message = `${method}: ${body.error.message ?? `error ${String(body.error.code)}`}`;
      if (body.error.code === 429 || RATE_LIMITED.test(message))
        throw new RateLimitedError({ source: LABEL, reason: 'rate-limited', message });
      throw new ClientError({ source: LABEL, reason: 'read-failed', message });
    }
    if (body.result === undefined)
      throw new ResponseShapeError({ source: LABEL, reason: 'bad-response', message: `${method}: no result` });
    return body.result;
  }, WEIGHT[method]);
