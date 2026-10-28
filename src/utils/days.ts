/**
 * dayOf: the UTC day of a Date as an ISO date.
 * @dev review: src/discover/dateResult.ts
 */
export const dayOf = (at: Date): string => at.toISOString().slice(0, 10);
