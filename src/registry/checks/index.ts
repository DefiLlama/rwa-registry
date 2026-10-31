/**
 * The registry checks, one line each, and checkRegistry, which runs them all over one registry.
 * @dev review: src/registry/loadRegistry.ts
 */
import type { Registry } from '../../schema';
import { dayOf } from '../../utils/days';
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
import { marketTracks } from './marketTracks';
import { organizationKinds } from './organizationKinds';
import { platformFolders } from './platformFolders';
import { primaryDeployments } from './primaryDeployments';
import { references } from './references';
import { reviewFlags } from './reviewFlags';
import { underlyingClasses } from './underlyingClasses';
import { uniqueKeys } from './uniqueKeys';
import { unknownChains } from './unknownChains';
import { venueAdapters } from './venueAdapters';

// day is the day the registry is checked at: today for validate and every write, --at for build.
export type Check = (registry: Registry, day: string) => Problem[];

export const checks: Check[] = [
  references,
  cycles,
  datedDeployments,
  contractlessDeployments,
  unknownChains,
  marketTracks,
  uniqueKeys,
  platformFolders,
  organizationKinds,
  underlyingClasses,
  flagOverrides,
  reviewFlags,
  primaryDeployments,
  fileNames,
  displaySlugs,
  addressFormats,
  eventTargets,
  eventNotes,
  dateOrder,
  ackFields,
  venueAdapters,
];

export const checkRegistry = (registry: Registry, day: string = dayOf(new Date())): Problem[] =>
  checks.flatMap((check) => check(registry, day));
