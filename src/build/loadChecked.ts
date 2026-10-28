/**
 * loadChecked: the registry loaded with every problem validate and build fail on, the registry checks plus the published venue check.
 * @dev review: src/build/venueAdapters.ts
 */
import { loadRegistry, type Problem } from '../registry';
import type { Registry } from '../schema';
import { venueAdapters } from './venueAdapters';

export const loadChecked = (
  root: string,
  base: Registry | null = null,
): { registry: Registry; problems: Problem[] } => {
  const loaded = loadRegistry(root, base);
  return { ...loaded, problems: [...loaded.problems, ...venueAdapters(loaded.registry)] };
};
