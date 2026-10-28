import { describe, expect, it, vi } from 'vitest';
import { paced } from '../../src/discover/paced';
import { HttpStatusError, RateLimitedError, TimeoutError } from '../../src/errors';

const limited = () => new RateLimitedError({ source: 'fake', reason: 'rate-limited', message: 'HTTP 429' });

// A pacer whose clock stands still, so every wait it asks for is recorded and none passes.
const stillPacer = (
  pace: { concurrency: number; minIntervalMs: number },
  retry: { retries: number; retryDelayMs: number },
) => {
  const waits: number[] = [];
  const run = paced(
    { ...pace, timeoutMs: 1 },
    retry,
    async (ms) => {
      waits.push(ms);
    },
    () => 0,
  );
  return { run, waits };
};

describe('paced', () => {
  it('retries a rate-limited read the configured times, and a timeout or another failure never', async () => {
    const { run } = stillPacer({ concurrency: 1, minIntervalMs: 0 }, { retries: 2, retryDelayMs: 100 });
    const flaky = vi.fn().mockRejectedValueOnce(limited()).mockResolvedValueOnce('read');
    const broken = vi
      .fn()
      .mockRejectedValue(new HttpStatusError({ source: 'fake', reason: 'http-error', message: 'HTTP 500' }));
    const slow = vi.fn().mockRejectedValue(new TimeoutError({ source: 'fake', reason: 'timeout', message: 'slow' }));

    await expect(run(flaky)).resolves.toBe('read');
    await expect(run(broken)).rejects.toThrow('HTTP 500');
    await expect(run(slow)).rejects.toThrow('slow');
    expect([flaky, broken, slow].map((task) => task.mock.calls.length)).toEqual([2, 1, 1]);
  });

  it('holds back every read of the source after a rate limit, not only the read that was limited', async () => {
    const { run, waits } = stillPacer({ concurrency: 2, minIntervalMs: 0 }, { retries: 1, retryDelayMs: 1000 });
    await run(() => Promise.reject(limited())).catch(() => null);
    await run(async () => 'other');

    expect(waits).toEqual([1000, 1000]);
    expect(run.stats).toMatchObject({ calls: 3, failed: { 'rate-limited': 2 } });
  });

  it('spaces the starts of one source by its minimum gap times the weight of the read before', async () => {
    const { run, waits } = stillPacer({ concurrency: 3, minIntervalMs: 250 }, { retries: 0, retryDelayMs: 0 });
    await run(async () => 'heavy', 2);
    await run(async () => 'light');
    await run(async () => 'light');

    expect(waits).toEqual([500, 750]);
  });
});
