import { describe, expect, it } from 'vitest';
import { usdRange, year } from '../../../src/cli/answers/numbers';
import { baseTree, registryOf } from '../../fixtures/tree';

const context = { registry: registryOf(baseTree()), values: {} };
const refusedOf = (read: object) => 'refused' in read;

describe('number answers', () => {
  it('a year refuses a word, a year before 1800 and next year', () => {
    const next = String(new Date().getUTCFullYear() + 1);

    expect(['abc', '1799', next, '2021.5'].map((typed) => refusedOf(year.read(typed, context)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(year.read('2021', context)).toEqual({ value: 2021 });
  });

  it('a USD range reads low:high and refuses a high below its low', () => {
    expect(usdRange.read('0:1000', context)).toEqual({ value: [0, 1000] });
    expect(refusedOf(usdRange.read('5:1', context))).toBe(true);
  });
});
