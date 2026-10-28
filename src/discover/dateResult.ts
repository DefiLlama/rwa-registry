/**
 * dateResult: what a date reader answers for one address or market: the day with its block and source, or null with a reason.
 * @dev review: src/discover/reasons.ts
 */
import { reasonOf } from '../errors/reasons';
import { HttpStatusError, RwaError } from '../errors';
import { dayOf } from '../utils/days';
import type { DiscoverReason } from './reasons';

export type Basis =
  | 'contract-creation'
  | 'first-code'
  | 'first-signature'
  | 'first-transaction'
  | 'first-issue'
  | 'issuer-first-transaction'
  | 'asset-created'
  | 'contract-created'
  | 'first-activity'
  | 'package-published'
  | 'listing-field'
  // Solscan's created_time of a Solana mint.
  | 'created-time'
  // The oldest signature of a Solana mint's Metaplex metadata account.
  | 'metadata-created'
  // The first day DefiLlama stored a value for the asset on the chain: first seen by DefiLlama, not the contract's creation.
  | 'first-stored-day';

export type DateFound = { date: string; block: number | null; source: string; basis: Basis; reason: null };
// detail names the HTTP status or the parse failure; cursor is where a capped read resumes.
export type DateMissing = {
  date: null;
  block: null;
  source: string | null;
  basis: null;
  reason: DiscoverReason;
  detail: string | null;
  cursor: string | null;
};
export type DateResult = DateFound | DateMissing;

export const missing = (
  reason: DiscoverReason,
  source: string | null = null,
  { detail = null, cursor = null }: { detail?: string | null; cursor?: string | null } = {},
): DateMissing => ({ date: null, block: null, source, basis: null, reason, detail, cursor });

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
