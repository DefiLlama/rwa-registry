import { describe, expect, it } from 'vitest';
import { applyDates } from '../../src/import/applyDates';
import { delistingEvent } from '../../src/import/mapOrganizations';

const delisted = (legacyId: number) => ({ slug: `a${legacyId}`, legacyId, events: [delistingEvent()] });

describe('applyDates', () => {
  it('dates a delisting at its last stored day and leaves one with no stored day null', () => {
    const files = new Map([
      ['assets/p/a1.json', delisted(1)],
      ['assets/p/a2.json', delisted(2)],
    ]);

    const dated = applyDates(files, { '1': { first: '2025-01-10', last: '2026-03-02' } });
    const eventsOf = (path: string) => (dated.get(path) as { events: unknown }).events;

    expect(eventsOf('assets/p/a1.json')).toEqual([
      { kind: 'listing', date: '2025-01-10' },
      { kind: 'delisting', date: '2026-03-02' },
    ]);
    expect(eventsOf('assets/p/a2.json')).toEqual([
      { kind: 'delisting', date: null, note: 'never stored in the daily tables' },
    ]);
  });
});
