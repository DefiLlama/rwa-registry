/**
 * The http client: the one place a URL is fetched, each failure a named error whose message never holds the URL.
 * @dev review: src/errors/clients.ts
 */
import { Agent, fetch as undiciFetch } from 'undici';
import { ClientError, HttpStatusError, RateLimitedError, ResponseShapeError, TimeoutError } from '../errors';

export interface HttpRequest {
  label: string;
  url: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number>;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpClient {
  json<T = unknown>(request: HttpRequest): Promise<T>;
}

export interface HttpLimits {
  timeoutMs: number;
  connectTimeoutMs: number;
}

const RATE_LIMITED = 429;
const CONNECT_TIMEOUT = 'UND_ERR_CONNECT_TIMEOUT';

// The network error's code (ECONNREFUSED, ENOTFOUND) names the cause; its message may hold the URL and its key.
const causeOf = (cause: unknown) => {
  const inner = (cause as { cause?: { code?: unknown } })?.cause;
  return typeof inner?.code === 'string' ? inner.code : ((cause as Error)?.name ?? 'unknown');
};

const withQuery = (url: string, query: HttpRequest['query']) => {
  if (!query) return url;
  const target = new URL(url);
  Object.entries(query).forEach(([key, value]) => target.searchParams.set(key, String(value)));
  return target.toString();
};

const send = async (
  fetchImpl: typeof fetch,
  request: HttpRequest,
  { timeoutMs, connectTimeoutMs }: HttpLimits,
): Promise<Response> => {
  const { label: source, url, method = 'GET', query, headers, body } = request;
  try {
    return await fetchImpl(withQuery(url, query), {
      method,
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const name = (cause as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError')
      throw new TimeoutError({ source, reason: 'timeout', message: `no answer within ${timeoutMs} ms`, cause });
    if (causeOf(cause) === CONNECT_TIMEOUT)
      throw new TimeoutError({
        source,
        reason: 'timeout',
        message: `no connection within ${connectTimeoutMs} ms`,
        cause,
      });
    throw new ClientError({ source, reason: 'source-failed', message: `request failed (${causeOf(cause)})`, cause });
  }
};

// undici's own connect timeout is 10 s, shorter than some TLS handshakes take, so the config sets it.
const fetchWith = (connectTimeoutMs: number): typeof fetch => {
  const dispatcher = new Agent({ connect: { timeout: connectTimeoutMs } });
  return ((url: string, init: RequestInit) =>
    undiciFetch(url, { ...(init as object), dispatcher })) as unknown as typeof fetch;
};

export const createHttp = (limits: HttpLimits, fetchImpl?: typeof fetch): HttpClient => {
  const fetcher = fetchImpl ?? fetchWith(limits.connectTimeoutMs);
  return {
    json: async <T>(request: HttpRequest): Promise<T> => {
      const { label: source } = request;
      const response = await send(fetcher, request, { ...limits, timeoutMs: request.timeoutMs ?? limits.timeoutMs });
      if (response.status === RATE_LIMITED)
        throw new RateLimitedError({ source, reason: 'rate-limited', message: 'HTTP 429' });
      if (!response.ok) throw new HttpStatusError({ source, reason: 'http-error', message: `HTTP ${response.status}` });
      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch (cause) {
        throw new ResponseShapeError({ source, reason: 'bad-response', message: 'the body is not JSON', cause });
      }
    },
  };
};
