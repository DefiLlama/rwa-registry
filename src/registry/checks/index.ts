/**
 * The registry checks, one line each, and checkRegistry, which runs them all against the base registry of origin/main when one is given.
 * @dev review: src/registry/loadRegistry.ts
 */
import type { Registry } from '../../schema';
import type { Problem } from '../problem';
import { ackFields } from './ackFields';
import { addressFormats } from './addressFormats';
import { contractlessDeployments } from './contractlessDeployments';
import { cycles } from './cycles';
import { datedDeployments } from './datedDeployments';
import { dateOrder } from './dateOrder';
import { displaySlugs } from './displaySlugs';
import { eventNotes } from './eventNotes';
import { eventTargets } from './eventTargets';
import { fileNames } from './fileNames';
import { flagOverrides } from './flagOverrides';
import { frozenKeys } from './frozenKeys';
import { marketTracks } from './marketTracks';
import { organizationKinds } from './organizationKinds';
import { platformFolders } from './platformFolders';
import { primaryDeployments } from './primaryDeployments';
import { references } from './references';
import { underlyingClasses } from './underlyingClasses';
import { uniqueKeys } from './uniqueKeys';
import { unknownChains } from './unknownChains';

export type Check = (registry: Registry, base: Registry | null) => Problem[];

export const checks: Check[] = [
  references,
  cycles,
  datedDeployments,
  contractlessDeployments,
  unknownChains,
  marketTracks,
  uniqueKeys,
  frozenKeys,
  platformFolders,
  organizationKinds,
  underlyingClasses,
  flagOverrides,
  primaryDeployments,
  fileNames,
  displaySlugs,
  addressFormats,
  eventTargets,
  eventNotes,
  dateOrder,
  ackFields,
];

export const checkRegistry = (registry: Registry, base: Registry | null): Problem[] =>
  checks.flatMap((check) => check(registry, base));
