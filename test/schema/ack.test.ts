import { describe, expect, it } from 'vitest';
import { ackKinds } from '../../src/schema/ack';

const life = { from: '2026-09-03', until: null };
const band = { metrics: ['onChainMcap', 'activeMcap'], direction: 'down' };

// One file per kind as it holds it, the change that makes it refused, and the field the refusal names.
const CASES: [kind: string, file: Record<string, unknown>, change: Record<string, unknown>, field: string][] = [
  [
    'asset-move',
    { asset: 'fiusd', ...life, ...band, maxCurrentUsd: 1000, minPreviousUsd: 100000 },
    { maxCurrentUsd: undefined },
    'maxCurrentUsd',
  ],
  [
    'asset-move-release',
    { asset: 'satusd', ...life, ...band, direction: 'up', currentUsd: [140e6, 180e6], previousUsd: [130e6, 148e6] },
    { previousUsd: [148e6, 130e6] },
    'previousUsd',
  ],
  ['flows-hidden', { asset: 'brz', ...life }, { day: '2026-09-03' }, 'day'],
  ['single-point', { asset: 'heloc', ...life, maxValueUsd: 25e9 }, { maxValueUsd: undefined }, 'maxValueUsd'],
  ['aggregate-jump', { asset: 'tbill', day: '2026-09-07' }, { from: '2026-09-07' }, 'from'],
  ['head-move', { series: 'chain/ethereum', day: '2026-10-15' }, { day: undefined }, 'day'],
  [
    'drift',
    { series: 'chain/ethereum', firstDay: '2026-10-01', lastDay: '2026-10-02' },
    { lastDay: undefined },
    'lastDay',
  ],
  ['perps-venue', { venue: 'bitget', ...life }, { asset: 'bitget' }, 'asset'],
  ['perps-market', { contract: 'risex:aero', ...life }, { contract: 'aero' }, 'contract'],
];

const refusedFields = (value: unknown) =>
  ackKinds
    .safeParse(value)
    .error?.issues.flatMap((issue) => (issue.code === 'unrecognized_keys' ? issue.keys : [issue.path.join('.')]));

describe('ackKinds', () => {
  it.each(CASES)('takes a %s ack and refuses it changed', (kind, fields, change, field) => {
    const file = { slug: 'x', kind, ...fields, reason: 'test', resolve: 'test' };

    expect(ackKinds.safeParse(file).success).toBe(true);
    expect(refusedFields({ ...file, ...change })).toEqual([field]);
  });
});
