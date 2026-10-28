import { describe, expect, it } from 'vitest';
import { limit } from '../../src/utils/limit';

describe('limit', () => {
  it('keeps at most n tasks in flight and answers each task its own result', async () => {
    const limiter = limit(2);
    let active = 0;
    let peak = 0;
    const results = await Promise.all(
      [30, 10, 20, 5].map((ms) =>
        limiter(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, ms));
          active--;
          return ms;
        }),
      ),
    );

    expect(results).toEqual([30, 10, 20, 5]);
    expect(peak).toBe(2);
  });
});
