/**
 * limit: at most n tasks in flight.
 * @dev review: src/discover/paced.ts
 */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export const limit = (concurrency: number): Limiter => {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = () => {
    active--;
    waiting.shift()?.();
  };
  return async (task) => {
    if (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
};
