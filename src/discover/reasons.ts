/**
 * reasons: why a date is null; the shared reasons plus the ones only a date reader gives.
 * @dev review: src/errors/reasons.ts
 */
import { REASONS } from '../errors/reasons';

export const DISCOVER_REASONS = [
  ...REASONS,
  'no-reader',
  'no-code',
  'code-search-timeout',
  'page-cap',
  'history-truncated',
  'needs-history-dump',
] as const;
export type DiscoverReason = (typeof DISCOVER_REASONS)[number];

// A later run may read these differently, so the patch file never holds them and a resume asks again.
export const TRANSIENT: ReadonlySet<DiscoverReason> = new Set([
  'rate-limited',
  'timeout',
  'code-search-timeout',
  'http-error',
  'bad-response',
  'source-failed',
  'read-failed',
  'history-unreadable',
]);
