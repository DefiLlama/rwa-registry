/**
 * discoverConfig: the discover section of config/discover.json; a source's `<NAME>` key placeholder is read from the env, and a missing key leaves it null, so the next source answers instead.
 * @dev review: src/config/loadConfig.ts, src/discover/paced.ts
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { CONFIG_FILE, type Env } from '../config/loadConfig';

const PLACEHOLDER = /^<([A-Z][A-Z0-9_]*)>$/;

const count = z.number().int().positive();
const pace = { concurrency: count, minIntervalMs: z.number().int().nonnegative(), timeoutMs: count };
const site = { ...pace, baseUrl: z.string() };
const pages = { pageSize: count, maxPages: count };

const schema = z.object({
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
    // A resumed read starts one signature back, so a page holds at least two.
    solana: z.object({ ...pace, pageSize: z.number().int().min(2), pagesPerRun: count }),
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

export type DiscoverConfig = z.infer<typeof schema>;
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
  const { discover } = JSON.parse(readFileSync(file, 'utf8')) as {
    discover: { sources: Record<string, { apiKey?: string | null }> };
  };
  return schema.parse({ ...discover, sources: withKeys(discover.sources, env) });
};
