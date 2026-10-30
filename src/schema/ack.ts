/**
 * ack: one guard exception, acks/<kind>/<slug>.json, and ackKinds, the union ackFields checks each row against.
 * @dev review: src/registry/checks/ackFields.ts, docs/acks.md
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import { ACK_KINDS, ackKind, type AckKind } from './enums';
import { date, number, optional, ref, slug, text } from './primitives';

const usd = number.nonnegative();
const range = z.tuple([usd, usd]).refine(([low, high]) => low <= high, 'a range is [low, high], low no more than high');

// Every field a kind may hold, in file order: the target, the ack's own life, the series days, the band, the why.
const FIELDS = {
  asset: ref,
  venue: ref,
  // A chart series as the history guards name it, <dimension>/<key>, or * for every series.
  series: text.min(1),
  // A perps market with no file, as the coverage report names it.
  contract: text.regex(/^[^:\s]+:\S+$/, 'a contract is <venue>:<symbol>'),
  from: date,
  until: optional(date),
  day: date,
  firstDay: optional(date),
  lastDay: optional(date),
  // The two values the server's asset-move guard compares.
  metrics: z.array(z.enum(['onChainMcap', 'activeMcap'])).min(1),
  direction: z.enum(['up', 'down']),
  maxCurrentUsd: usd,
  minPreviousUsd: usd,
  currentUsd: range,
  previousUsd: range,
  maxValueUsd: usd,
  reason: text,
  resolve: text,
};
export type AckField = keyof typeof FIELDS;

// The fields each kind holds beside its slug, reason and resolve.
export const ACK_KIND_FIELDS: Record<AckKind, AckField[]> = {
  'asset-move': ['asset', 'from', 'until', 'metrics', 'direction', 'maxCurrentUsd', 'minPreviousUsd'],
  'asset-move-release': ['asset', 'from', 'until', 'metrics', 'direction', 'currentUsd', 'previousUsd'],
  'flows-hidden': ['asset', 'from', 'until'],
  'single-point': ['asset', 'from', 'until', 'maxValueUsd'],
  'aggregate-jump': ['asset', 'day'],
  'head-move': ['series', 'day'],
  drift: ['series', 'firstDay', 'lastDay'],
  'perps-venue': ['venue', 'from', 'until'],
  'perps-market': ['contract', 'from', 'until'],
};

export const isRequiredAckField = (field: AckField): boolean => !FIELDS[field].safeParse(undefined).success;

const kindSchema = (kind: AckKind) => {
  const schema = z.strictObject({
    slug,
    kind: z.literal(kind),
    ...(Object.fromEntries(
      [...ACK_KIND_FIELDS[kind], 'reason', 'resolve'].map((field) => [field, FIELDS[field as AckField]]),
    ) as Record<string, z.ZodType>),
  });
  // The server reads a drift ack with one day missing as a vanished-series ack, so the two come together.
  return kind === 'drift'
    ? schema.refine((row: Record<string, unknown>) => (row.firstDay == null) === (row.lastDay == null), {
        message: 'firstDay and lastDay are given together, or neither for a vanished series file',
        path: ['lastDay'],
      })
    : schema;
};

export const ackKinds = z.discriminatedUnion(
  'kind',
  ACK_KINDS.map(kindSchema) as [ReturnType<typeof kindSchema>, ...ReturnType<typeof kindSchema>[]],
);

type Loose<S> = { [K in keyof S]: z.ZodOptional<z.ZodNullable<S[K] & z.ZodType>> };
const loose = Object.fromEntries(
  Object.entries(FIELDS).map(([field, type]) => [field, optional(type)]),
) as unknown as Loose<typeof FIELDS>;

export const ack = defineTable({
  fields: () => ({ slug, kind: ackKind, ...loose }),
  implied: 'kind',
});
