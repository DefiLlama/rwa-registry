import { describe, expect, it } from 'vitest';
import { ackKinds } from '../../src/schema/ack';

const life = { from: '2026-09-03', until: null };
const band = { metrics: ['onChainMcap', 'activeMcap'], direction: 'down' };

// The kinds with a refinement of their own: the file as it holds it, the change it refuses, the field refused.
const CASES: [kind: string, file: Record<string, unknown>, change: Record<string, unknown>, field: string][] = [
  [
    'asset-move-release',
    { asset: 'satusd', ...life, ...band, direction: 'up', currentUsd: [140e6, 180e6], previousUsd: [130e6, 148e6] },
    { previousUsd: [148e6, 130e6] },
    'previousUsd',
  ],
  [
    'drift',
    { series: 'chain/ethereum', firstDay: '2026-10-01', lastDay: '2026-10-02' },
    { lastDay: undefined },
    'lastDay',
  ],
  ['perps-market', { contract: 'risex:aero', ...life }, { contract: 'aero' }, 'contract'],
];

describe('ackKinds', () => {
  it.each(CASES)('takes a %s ack and refuses it changed', (kind, fields, change, field) => {
    const file = { slug: 'x', kind, ...fields, reason: 'test', resolve: 'test' };

    expect(ackKinds.safeParse(file).success).toBe(true);
    const refused = ackKinds.safeParse({ ...file, ...change }).error?.issues;

    expect(
      refused?.flatMap((issue) => (issue.code === 'unrecognized_keys' ? issue.keys : [issue.path.join('.')])),
    ).toEqual([field]);
  });
});
