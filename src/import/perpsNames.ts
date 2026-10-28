/**
 * perpsNames: a market keeps the sheet's Name only where the venue's name, the tracked underlying's or asset's name and "Perp" do not spell it.
 * @dev review: src/import/mapPerps.ts
 */
import { homeOf } from '../registry/layout';
import { isStagedUnderlying } from './applyFolds';
import type { Call, FileJson, RegistryFiles } from './importTypes';

const bySlug = (files: RegistryFiles, test: (path: string) => boolean): Map<string, FileJson> =>
  new Map(
    [...files].flatMap(([path, json]) => (test(path) && !Array.isArray(json) ? [[String(json.slug), json]] : [])),
  );

const inTable = (table: string) => (path: string) => homeOf(path)?.table === table;

export const perpsNames = (staged: RegistryFiles): { files: RegistryFiles; calls: Call[] } => {
  const organizations = bySlug(staged, inTable('organization'));
  const venues = bySlug(staged, inTable('venue'));
  const assets = bySlug(staged, inTable('asset'));
  const underlyings = bySlug(staged, isStagedUnderlying);
  const files: RegistryFiles = new Map(staged);
  let derived = 0;
  let kept = 0;
  for (const [path, json] of staged) {
    if (!inTable('perp_market')(path) || Array.isArray(json) || json.name == null) continue;
    const label = organizations.get(String(venues.get(String(json.venue))?.organization))?.name;
    const tracked = (json.tracks != null ? underlyings.get(String(json.tracks)) : assets.get(String(json.tracksAsset)))
      ?.name;
    if (`${label} ${tracked} Perp` !== json.name) {
      kept += 1;
      continue;
    }
    const { name: _, ...market } = json;
    files.set(path, market);
    derived += 1;
  }
  const line = `${derived} market names are the venue's name, the tracked name and "Perp"; ${kept} keep the sheet's Name as identity.name. The server publishes name, else the derived one.`;
  return { files, calls: [{ topic: 'perps names', line }] };
};
