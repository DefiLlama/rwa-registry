/**
 * shouldBehaveLikeDateReader: what every date reader must do: one answer per query in order, and a failed source as null with its reason, never a date.
 * @dev review: src/discover/dateReader.ts
 */
import { expect, it } from 'vitest';
import type { DateQuery, DateReader } from '../../src/discover/dateReader';
import { answering, fakeDiscoverDeps } from '../fakes/discover';
import { failingRpc } from '../fakes/rpc';

export const shouldBehaveLikeDateReader = (reader: DateReader, queries: [DateQuery, DateQuery]) => {
  it(`${reader.family}: answers a failed source with null and a reason for every query, in order`, async () => {
    const deps = fakeDiscoverDeps({
      http: answering(() => Promise.reject(new Error('source down'))),
      rpc: failingRpc(),
    });
    const results = await reader.read(queries, deps);

    expect(results).toHaveLength(2);
    for (const result of results) expect(result).toMatchObject({ date: null, reason: expect.any(String) });
  });
};
