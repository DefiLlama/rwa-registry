/**
 * loadEnvFile: the repository's env file read into the environment before any command runs, so the discover keys can sit in a file; the file is never printed.
 * @dev review: src/discover/discoverConfig.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../discover/discoverConfig';

// src/cli and dist/cli both sit two folders below the repository root.
export const ENV_FILE = join(__dirname, '..', '..', '.env');

const LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

// A value in matching single or double quotes is taken without them.
const unquoted = (value: string) => (/^(["']).*\1$/.test(value) && value.length > 1 ? value.slice(1, -1) : value);

// Each KEY=value line sets KEY unless the environment already sets it; a # line, a blank line and any other line are skipped. Returns the names it set.
export const loadEnvFile = (path: string = ENV_FILE, env: Env = process.env): string[] => {
  if (!existsSync(path)) return [];
  const set: string[] = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const match = LINE.exec(line);
    if (!match) continue;
    const [, name, value] = match;
    if (env[name!] !== undefined) continue;
    env[name!] = unquoted(value!);
    set.push(name!);
  }
  return set;
};
