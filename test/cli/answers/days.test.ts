import { describe, expect, it } from 'vitest';
import { dayOrUnknown, period } from '../../../src/cli/answers/days';
import { baseTree, registryOf } from '../../fixtures/tree';

const context = { registry: registryOf(baseTree()), values: {} };

describe('day answers', () => {
  it('a day or unknown accepts unknown', () => {
    expect(dayOrUnknown.read('unknown', context)).toEqual({ value: 'unknown' });
  });

  it('a period refuses a thirteenth month and a fifth quarter, and takes a year', () => {
    expect(period.read('2026-13', context)).toHaveProperty('refused');
    expect(period.read('2026-Q5', context)).toHaveProperty('refused');
    expect(period.read('2023', context)).toEqual({ value: '2023' });
  });
});
