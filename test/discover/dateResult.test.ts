import { describe, expect, it } from 'vitest';
import { found, missingOf } from '../../src/discover/dateResult';
import { HttpStatusError } from '../../src/errors';

describe('dateResult', () => {
  it("keeps a named error's message as the detail, and only the name of any other error", () => {
    const status = missingOf(new HttpStatusError({ source: 'tronscan', reason: 'http-error', message: 'HTTP 502' }));
    const foreign = missingOf(new Error('https://rpc.example/secret-key refused'));

    expect(status).toMatchObject({ reason: 'http-error', detail: 'tronscan: HTTP 502' });
    expect(foreign.detail).toBe('Error with no message kept');
  });

  it('answers bad-response with the parse failure named when the answer holds no time', () => {
    expect(found(Number('n/a'), null, 'sui', 'package-published')).toMatchObject({
      date: null,
      reason: 'bad-response',
      detail: 'the answer holds no time (NaN)',
    });
  });
});
