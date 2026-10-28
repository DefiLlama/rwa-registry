/**
 * importContext: what every row mapper looks up, built once: vocabulary slugs, the chain book, the organizations and the underlyings.
 * @dev review: src/import/mapAssets.ts
 */
import { ChainBook } from './chainBook';
import type { Exports } from './importTypes';
import { mapOrganizations } from './mapOrganizations';
import { mapUnderlyings } from './mapUnderlyings';
import { mapVocabularies, type ExistingVocabularies } from './mapVocabularies';
import { rowFate } from './rowFate';

export const importContext = (exports: Exports, existing: ExistingVocabularies) => {
  const imported = exports.markets.filter((row) => ['asset', 'perps'].includes(rowFate(row)));
  const underlyings = mapUnderlyings(imported);
  const vocabularies = mapVocabularies(exports, existing, [...underlyings.currencies, 'BRL']);
  const chains = new ChainBook();
  const organizations = mapOrganizations(exports, { slugOf: vocabularies.slugOf, chains });
  return { vocabularies, chains, organizations, underlyings, slugOf: vocabularies.slugOf };
};

export type ImportContext = ReturnType<typeof importContext>;
