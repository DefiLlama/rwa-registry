import { describe, expect, it } from 'vitest';
import { DONE, matching, pickRound } from '../../src/cli/ask';

const OPTIONS = [
  { value: 'stocks-equities', name: 'Stocks & Equities' },
  { value: 'rwa-perps', name: 'RWA Perps' },
];

describe('a round of pick many', () => {
  it('offers no (done) while a required answer has nothing picked', () => {
    expect(pickRound(OPTIONS, [], false)).toEqual(OPTIONS);
  });

  it('offers (done) first once one is picked, and keeps the picked one in the list, marked', () => {
    expect(pickRound(OPTIONS, ['rwa-perps'], false)).toEqual([
      { value: DONE, name: '(done)' },
      OPTIONS[0],
      { value: 'rwa-perps', name: 'RWA Perps (picked)' },
    ]);
  });

  it('hides (done) while a filter is typed, so Enter picks the first match', () => {
    expect(matching(pickRound(OPTIONS, ['rwa-perps'], false), 'stocks')).toEqual([OPTIONS[0]]);
  });
});
