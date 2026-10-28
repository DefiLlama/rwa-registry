/**
 * reasons: the named reasons a null value or a thrown error carries, shared by the errors and the discover readers.
 * @dev review: src/errors/clients.ts
 */
export const REASONS = [
  'rate-limited',
  'timeout',
  'http-error',
  'bad-response',
  'source-failed',
  'read-failed',
  'not-found',
  'history-unreadable',
] as const;
export type Reason = (typeof REASONS)[number];

export const reasonOf = (error: unknown): Reason => {
  const reason = (error as { reason?: unknown })?.reason;
  return REASONS.includes(reason as Reason) ? (reason as Reason) : 'source-failed';
};
