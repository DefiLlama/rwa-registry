/**
 * discoverConfig: config/discover.json, its http limits, venue URLs and sources, a `<NAME>` key placeholder read from the env or left null.
 * @dev review: src/discover/paced.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const CONFIG_FILE = join(__dirname, '..', '..', 'config', 'discover.json');
export type Env = Record<string, string | undefined>;

const PLACEHOLDER = /^<([A-Z][A-Z0-9_]*)>$/;

const count = z.number().int().positive();
const pace = { concurrency: count, minIntervalMs: z.number().int().nonnegative(), timeoutMs: count };
const site = { ...pace, baseUrl: z.string() };
const pages = { pageSize: count, maxPages: count };

const discover = z.object({
  retries: z.number().int().nonnegative(),
  retryDelayMs: z.number().int().nonnegative(),
  sources: z.object({
    etherscan: z.object({
      ...site,
      apiKey: z.string().nullable(),
      batchSize: count,
      chainIds: z.record(z.string(), count),
    }),
    // firstBlocks: the first block a chain's nodes serve state for, such as Arbitrum's Nitro genesis.
    evmCode: z.object({ ...pace, maxSteps: count, firstBlocks: z.record(z.string(), z.number().int().nonnegative()) }),
    // baseUrl holds {subdomain}; a chain with no subdomain here is searched on the public node.
    alchemy: z.object({
      ...site,
      apiKey: z.string().nullable(),
      subdomains: z.record(z.string(), z.string()),
    }),
    blockscout: z.object({ ...pace, batchSize: count, explorers: z.record(z.string(), z.string()) }),
    solana: z.object({ ...pace, pageSize: count, pagesPerRun: count }),
    // Solscan's token meta: one creation time per mint, asked before the signature walk when the key is set.
    solscan: z.object({ ...site, apiKey: z.string().nullable() }),
    // The RWA chart of an asset on the Pro API; baseUrl holds {key}. chartKeys: the chart's chain keys for a registry slug beyond the slug itself and its underscore form.
    history: z.object({ ...site, apiKey: z.string().nullable(), chartKeys: z.record(z.string(), z.array(z.string())) }),
    horizon: z.object({ ...site, ...pages }),
    stellarExpert: z.object(site),
    xrpl: z.object({ ...site, ...pages }),
    tronscan: z.object(site),
    aptos: z.object(site),
    sui: z.object(site),
    toncenter: z.object({ ...site, apiKey: z.string().nullable(), pageSize: count }),
    listings: z.object(pace),
  }),
});

const schema = z.object({
  sources: z.object({ http: z.object({ timeoutMs: count, connectTimeoutMs: count }) }),
  venues: z.record(z.string(), z.object({ urls: z.object({ api: z.string() }) })),
  discover,
});

type ConfigFile = z.infer<typeof schema>;
export type DiscoverConfig = ConfigFile['discover'] & {
  http: ConfigFile['sources']['http'];
  venues: ConfigFile['venues'];
};
export type DiscoverSource = keyof DiscoverConfig['sources'];
export type Pace = z.infer<z.ZodObject<typeof pace>>;

// Each source's apiKey placeholder becomes the env value, or null when the env lacks it.
const withKeys = (sources: Record<string, { apiKey?: string | null }>, env: Env) =>
  Object.fromEntries(
    Object.entries(sources).map(([name, source]) => {
      const key = PLACEHOLDER.exec(source.apiKey ?? '')?.[1];
      return [name, key ? { ...source, apiKey: env[key] || null } : source];
    }),
  );

export const loadDiscoverConfig = (env: Env, file = CONFIG_FILE): DiscoverConfig => {
  const json = JSON.parse(readFileSync(file, 'utf8')) as {
    discover: { sources: Record<string, { apiKey?: string | null }> };
  };
  const parsed = schema.parse({
    ...json,
    discover: { ...json.discover, sources: withKeys(json.discover.sources, env) },
  });
  return { ...parsed.discover, http: parsed.sources.http, venues: parsed.venues };
};
