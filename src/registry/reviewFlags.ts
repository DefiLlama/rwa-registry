/**
 * reviewFlags: the suspicious and delisted flags a row holds, read from its own events: suspicious when its latest review found it suspicious, delisted when its latest listing or delisting event is a delisting. fileWithReviewFlags is the one place a write sets them.
 * @dev review: src/registry/checks/reviewFlags.ts, then src/cli/writeCommand.ts
 */
import { blockFields, fieldPath, inSchemaOrder, TABLE_NAMES, type Row, type TableName } from '../schema';
import { PLATFORM_KINDS } from '../schema/organization';
import { isObject } from '../utils/isObject';
import { setAt, stepsOf } from '../utils/fieldPath';
import { LISTING_KINDS, latestOf } from './deriveFields';
import { homeOf } from './layout';

type EventLike = Pick<Row<'event'>, 'kind' | 'date' | 'outcome'>;
type Json = Record<string, unknown>;
export type ReviewFlags = { suspicious: boolean; delisted: boolean };

export const REVIEW_FLAGS = ['suspicious', 'delisted'] as const;

export const FLAG_EVENT_KINDS: Record<keyof ReviewFlags, string[]> = {
  suspicious: ['review'],
  delisted: LISTING_KINDS,
};

export const REVIEW_FLAG_TABLES: TableName[] = TABLE_NAMES.filter((table) =>
  REVIEW_FLAGS.every((flag) => blockFields(table, 'review').includes(flag)),
);

// An organization holds them only as a platform or venue operator.
export const holdsReviewFlags = (table: TableName, kind?: string | null): boolean =>
  REVIEW_FLAG_TABLES.includes(table) && (table !== 'organization' || PLATFORM_KINDS.includes(kind ?? ''));

// Every event in the file counts, whatever its day; validate refuses one after the day it checks at.
export const reviewFlagsOf = (events: EventLike[]): ReviewFlags => ({
  suspicious: latestOf(events, FLAG_EVENT_KINDS.suspicious)?.outcome === 'suspicious',
  delisted: latestOf(events, FLAG_EVENT_KINDS.delisted)?.kind === 'delisting',
});

export const withReviewFlags = (table: TableName, file: Json): Json => {
  const events = (Array.isArray(file.events) ? file.events : []).filter(isObject) as EventLike[];
  const flags = reviewFlagsOf(events);
  return REVIEW_FLAGS.reduce((into, flag) => setAt(into, stepsOf(fieldPath(table, flag)), flags[flag]) as Json, file);
};

// A file about to be written, in schema order with its flags set from its events where its row holds them.
export const fileWithReviewFlags = (path: string, content: unknown): unknown => {
  const home = homeOf(path);
  if (!home || !isObject(content) || !holdsReviewFlags(home.table, home.implied)) return content;
  return inSchemaOrder(home.table, withReviewFlags(home.table, content));
};
