/**
 * marketTracks: a perps market tracks exactly one underlying or one asset.
 * @dev review: src/registry/checks/references.ts
 */
import { MarketTrackError } from '../../errors';
import type { Registry } from '../../schema';
import { report, type Problem } from '../problem';

export const marketTracks = (registry: Registry): Problem[] =>
  registry.perp_market
    .filter((row) => [row.tracks, row.tracksAsset].filter((value) => value != null).length !== 1)
    .map((row) =>
      report(MarketTrackError, 'perp_market', row, 'tracks', 'a market tracks exactly one of tracks and tracksAsset'),
    );
