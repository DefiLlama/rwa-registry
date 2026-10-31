import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { today } from '../../../src/cli/writeCommand';
import { baseTree, writeTree } from '../../fixtures/tree';
import { fakeAsk } from '../../fakes/prompter';
import { readJson, runCli } from '../runCli';

const why = ['--reason', 'test', '--resolve', 'test'];
const life = { from: '2026-10-24', until: null };

const CASES: [kind: string, target: string, flags: string[], file: string, content: Record<string, unknown>][] = [
  [
    'asset-move',
    'tslax',
    ['--from', '2026-10-24'],
    'asset-move/tslax.json',
    {
      slug: 'tslax',
      asset: 'tslax',
      ...life,
      metrics: ['onChainMcap', 'activeMcap'],
      direction: 'down',
      maxCurrentUsd: 1000,
      minPreviousUsd: 100000,
    },
  ],
  [
    'asset-move-release',
    'tslax',
    [
      ...['--from', '2026-10-24', '--until', '2026-11-30', '--metrics', 'activeMcap', '--direction', 'up'],
      ...['--current', '11000000:14000000', '--previous', '1400000:1800000'],
    ],
    'asset-move-release/tslax.json',
    {
      slug: 'tslax',
      asset: 'tslax',
      from: '2026-10-24',
      until: '2026-11-30',
      metrics: ['activeMcap'],
      direction: 'up',
      currentUsd: [11000000, 14000000],
      previousUsd: [1400000, 1800000],
    },
  ],
  [
    'flows-hidden',
    'tslax',
    ['--from', '2026-10-24'],
    'flows-hidden/tslax.json',
    { slug: 'tslax', asset: 'tslax', ...life },
  ],
  [
    'single-point',
    'tslax',
    ['--from', '2026-10-24', '--max-value', '300000000'],
    'single-point/tslax.json',
    { slug: 'tslax', asset: 'tslax', ...life, maxValueUsd: 300000000 },
  ],
  [
    'aggregate-jump',
    'tslax',
    ['--day', '2026-09-07'],
    'aggregate-jump/tslax-2026-09-07.json',
    { slug: 'tslax-2026-09-07', asset: 'tslax', day: '2026-09-07' },
  ],
  [
    'head-move',
    'chain/robinhood-chain',
    ['--day', '2026-10-15'],
    'head-move/chain-robinhood-chain-2026-10-15.json',
    { slug: 'chain-robinhood-chain-2026-10-15', series: 'chain/robinhood-chain', day: '2026-10-15' },
  ],
  [
    'drift',
    'chain/ethereum',
    ['--first-day', '2026-10-01', '--last-day', '2026-10-02'],
    'drift/chain-ethereum-2026-10-01.json',
    { slug: 'chain-ethereum-2026-10-01', series: 'chain/ethereum', firstDay: '2026-10-01', lastDay: '2026-10-02' },
  ],
  ['perps-venue', 'xyz', ['--from', '2026-10-24'], 'perps-venue/xyz.json', { slug: 'xyz', venue: 'xyz', ...life }],
  [
    'perps-market',
    'xyz:AERO',
    ['--from', '2026-10-24'],
    'perps-market/xyz-aero.json',
    { slug: 'xyz-aero', contract: 'xyz:aero', ...life },
  ],
];

describe('ack', () => {
  it.each(CASES)(
    'writes a %s ack on %s in acks/<kind>/, in schema order, and validate finds nothing new',
    async (kind, target, flags, file, content) => {
      const root = writeTree(baseTree());
      const before = await runCli(['validate', '--registry', root]);

      const { code } = await runCli(['ack', kind, target, '--registry', root, ...flags, ...why]);
      const after = await runCli(['validate', '--registry', root]);

      expect(code).toBe(0);
      expect(Object.entries(readJson(root, `acks/${file}`))).toEqual(
        Object.entries({ ...content, reason: 'test', resolve: 'test' }),
      );
      expect(after.lines).toEqual(before.lines);
    },
  );

  it('refuses a flag its kind does not take and writes nothing', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['ack', 'flows-hidden', 'tslax', '--registry', root, '--day', '2026-09-07', ...why]);

    expect(code).toBe(1);
    expect(existsSync(join(root, 'acks/flows-hidden/tslax.json'))).toBe(false);
  });
});

describe('ack, asked', () => {
  const answers = { reason: 'test', resolve: 'test' };

  it('asks the kind, the target, the reason, the resolve step, the band and the dates, offering the master band', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ kind: 'asset-move', target: 'tslax', ...answers });

    const { code } = await runCli(['ack', '--registry', root], prompter.ask);
    const question = (key: string) => prompter.asked.find((asked) => asked.key === key)!;

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual([
      ...['kind', 'target', 'reason', 'resolve', 'metrics', 'direction', 'maxCurrent', 'minPrevious'],
      ...['from', 'until', 'confirm'],
    ]);
    expect(question('target').choices).toEqual(['tslax']);
    expect(question('from').default).toBe(today());
    expect(prompter.asked.at(-1)!.message).toContain('most blocked value: 1000');
    expect(readJson(root, 'acks/asset-move/tslax.json')).toEqual({
      slug: 'tslax',
      asset: 'tslax',
      from: today(),
      until: null,
      metrics: ['onChainMcap', 'activeMcap'],
      direction: 'down',
      maxCurrentUsd: 1000,
      minPreviousUsd: 100000,
      ...answers,
    });
  });

  it('asks the ranges of a release and the day of an aggregate jump, each kind only its own fields', async () => {
    const root = writeTree(baseTree());
    const release = fakeAsk({ ...answers, metrics: ['activeMcap'], direction: 'up', current: '1:2', previous: '3:4' });
    const jump = fakeAsk({ ...answers, day: '2026-09-07' });

    await runCli(['ack', 'asset-move-release', 'tslax', '--registry', root, '--dry-run'], release.ask);
    const { code } = await runCli(['ack', 'aggregate-jump', 'tslax', '--registry', root], jump.ask);

    expect(release.keys()).toEqual([
      ...['reason', 'resolve', 'metrics', 'direction', 'current', 'previous', 'from', 'until', 'confirm'],
    ]);
    expect(jump.keys()).toEqual(['reason', 'resolve', 'day', 'confirm']);
    expect(code).toBe(0);
    expect(readJson(root, 'acks/aggregate-jump/tslax-2026-09-07.json').day).toBe('2026-09-07');
  });

  it('asks a series target as text and the two days of a drift', async () => {
    const root = writeTree(baseTree());
    const prompter = fakeAsk({ target: 'chain/ethereum', ...answers, firstDay: '2026-10-01', lastDay: '2026-10-02' });

    const { code } = await runCli(['ack', 'drift', '--registry', root], prompter.ask);

    expect(code).toBe(0);
    expect(prompter.keys()).toEqual(['target', 'reason', 'resolve', 'firstDay', 'lastDay', 'confirm']);
    expect(prompter.asked[0]).toMatchObject({
      choices: undefined,
      message: 'What does the ack cover? *',
      lines: ['Example: chain/ethereum, or * for every series'],
    });
    expect(existsSync(join(root, 'acks/drift/chain-ethereum-2026-10-01.json'))).toBe(true);
  });

  it('refuses a field its kind requires under --no-input', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli(['ack', 'aggregate-jump', 'tslax', '--registry', root, '--no-input', ...why]);

    expect(code).toBe(1);
    expect(lines).toEqual(['ack: --day is required']);
  });
});
