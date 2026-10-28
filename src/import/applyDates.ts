/**
 * applyDates: the listing and delisting dates from a dump of the first and last stored day per legacy id; without it a delisting stays undated.
 * @dev review: src/import/importExports.ts
 */
import { readFileSync } from 'node:fs';
import { ImportError } from '../errors';
import type { FileJson, RegistryFiles } from './importTypes';

export type StoredDays = Record<string, { first: string; last: string }>;

export const readDates = (file: string): StoredDays => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as StoredDays;
  } catch (cause) {
    throw new ImportError({ file, message: `${file} is not a dates dump: ${(cause as Error).message}`, cause });
  }
};

const dated = (file: FileJson, days: { first: string | null; last: string } | undefined): FileJson => {
  const events = (file.events as FileJson[] | undefined) ?? [];
  const delisting = events.find((event) => event.kind === 'delisting');
  if (!delisting) return file;
  const rest = events.filter((event) => event !== delisting && event.kind !== 'listing');
  const last = days
    ? { kind: 'delisting', date: days.last }
    : { kind: 'delisting', date: null, note: 'never stored in the daily tables' };
  return { ...file, events: [...(days?.first ? [{ kind: 'listing', date: days.first }] : []), last, ...rest] };
};

export const applyDates = (files: RegistryFiles, days: StoredDays | null): RegistryFiles => {
  if (!days) return files;
  const out: RegistryFiles = new Map();
  const lastByPlatform = new Map<string, string>();
  for (const [path, file] of files) {
    if (Array.isArray(file) || file.legacyId == null || !/^(assets|perps)\//.test(path)) {
      out.set(path, file);
      continue;
    }
    const own = days[String(file.legacyId)];
    out.set(path, dated(file, own));
    const platform = path.split('/')[1];
    if (path.startsWith('assets/') && own && own.last > (lastByPlatform.get(platform) ?? ''))
      lastByPlatform.set(platform, own.last);
  }
  for (const [path, file] of out) {
    const platform = /^assets\/([^/]+)\/platform\.json$/.exec(path)?.[1];
    if (!platform || Array.isArray(file)) continue;
    const last = lastByPlatform.get(platform);
    out.set(path, dated(file, last ? { first: null, last } : undefined));
  }
  return out;
};
