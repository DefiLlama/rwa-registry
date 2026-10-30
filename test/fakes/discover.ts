/**
 * fakeDiscoverDeps: the deps a date reader gets, with fake clients and pacers that never sleep.
 * @dev review: src/discover/discoverDeps.ts
 */
import { vi } from 'vitest';
import type { HttpClient, HttpRequest } from '../../src/clients/http';
import { loadDiscoverConfig, type DiscoverConfig } from '../../src/discover/discoverConfig';
import { pacersOf, type DiscoverClients, type DiscoverDeps } from '../../src/discover/discoverDeps';
import { fakeRpc } from './rpc';

export const discoverConfig = (env: Record<string, string> = {}): DiscoverConfig => {
  const config = loadDiscoverConfig(env);
  return { ...config, retries: 1 };
};

export const fakeDiscoverDeps = (
  clients: Partial<DiscoverClients> = {},
  discover: DiscoverConfig = discoverConfig(),
): DiscoverDeps => ({
  // A request no test answers fails by its URL, so a reader that reaches it is seen.
  clients: {
    http: answering(({ url }) => Promise.reject(new Error(`no fake answer for ${url}`))),
    rpc: fakeRpc(),
    ...clients,
  },
  discover,
  paced: pacersOf(discover, async () => {}),
  now: new Date('2026-10-25T12:00:00Z'),
  log: () => {},
});

// An http fake that answers each request from a handler, so POST bodies can choose the answer.
export const answering = (handler: (request: HttpRequest) => unknown): HttpClient => ({
  json: vi.fn(async (request: HttpRequest) => handler(request)) as HttpClient['json'],
});
