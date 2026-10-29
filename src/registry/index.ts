/**
 * The registry module, the only code that reads registry/: it loads, flattens, derives and checks.
 * @dev review: src/registry/loadRegistry.ts
 */
export { loadRegistry } from './loadRegistry';
export { checkRegistry } from './checks';
export { deriveFields, endedRows } from './deriveFields';
export { rowSlug, rwaSlug } from './rwaSlug';
export { nextAssetKeys } from './nextAssetKeys';
export { keyOf, marketId } from './keys';
export { ACKS_DIR, homeFile, marketFile, platformFile, REGISTRY_DIR } from './layout';
export { fileOf } from './place';
export { moveReferences, moveReferencesBy } from './moveReferences';
export { familyOf } from './chains';
export type { Problem, Severity } from './problem';
