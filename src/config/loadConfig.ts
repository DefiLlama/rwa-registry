/**
 * loadConfig: the http limits and the venue URLs in config/discover.json; the discover section has its own loader with its keys.
 * @dev review: src/discover/discoverConfig.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const CONFIG_FILE = join(__dirname, '..', '..', 'config', 'discover.json');

const count = z.number().int().positive();

const configSchema = z.object({
  sources: z.object({ http: z.object({ timeoutMs: count, connectTimeoutMs: count }) }),
  venues: z.record(z.string(), z.object({ urls: z.object({ api: z.string() }) })),
});

export type Config = z.infer<typeof configSchema>;
export type Env = Record<string, string | undefined>;

export const loadConfig = (file = CONFIG_FILE): Config => configSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
