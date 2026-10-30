/**
 * dateResult: what a date reader answers for one address or market: the day with its block and source, or null with a reason.
 * @dev review: src/discover/reasons.ts
 */
import { reasonOf } from '../errors/reasons';
import type { DeploymentBasis } from '../schema';
import { HttpStatusError, RwaError } from '../errors';
import { dayOf } from '../utils/days';
import type { DiscoverReason } from './reasons';

// A deployment's basis, or listing-field for a market's listing day read from a venue's field.
export type Basis = DeploymentBasis | 'listing-field';

export type DateFound = { date: string; block: number | null; source: string; basis: Basis; reason: null };
// detail names the HTTP status or the parse failure.
export type DateMissing = {
  date: null;
  block: null;
  source: string | null;
  basis: null;
  reason: DiscoverReason;
  detail: string | null;
};
export type DateResult = DateFound | DateMissing;

export const missing = (
  reason: DiscoverReason,
  source: string | null = null,
  { detail = null }: { detail?: string | null } = {},
): DateMissing => ({ date: null, block: null, source, basis: null, reason, detail });

export const found = (seconds: number, block: number | null, source: string, basis: Basis): DateResult =>
  Number.isFinite(seconds) && seconds > 0
    ? { date: dayOf(new Date(seconds * 1000)), block, source, basis, reason: null }
    : missing('bad-response', source, { detail: `the answer holds no time (${String(seconds)})` });

// Only a named error's message is kept, since another error's message may hold an RPC URL and its key.
const detailOf = (error: unknown) =>
  error instanceof RwaError ? error.message : `${(error as Error)?.name ?? 'unknown'} with no message kept`;

export const missingOf = (error: unknown, source: string | null = null): DateMissing =>
  missing(
    error instanceof HttpStatusError && error.message.endsWith('HTTP 404') ? 'not-found' : reasonOf(error),
    source,
    { detail: detailOf(error) },
  );

export const whyOf = ({ reason, detail, source }: DateMissing): string =>
  `${reason}: ${detail ?? source ?? 'no source answered'}`;
