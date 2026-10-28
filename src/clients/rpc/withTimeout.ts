/**
 * withTimeout: a chain read that has not answered within the source's timeout rejects with TimeoutError.
 * @dev review: src/errors/clients.ts
 */
import { TimeoutError } from '../../errors';

// The setting every chain read takes: how long one call may wait.
export type RpcConfig = { timeoutMs: number };

export const withTimeout = <T>(work: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new TimeoutError({ source: 'rpc', reason: 'timeout', message: `${label}: no answer within ${ms} ms` }),
          ),
        ms,
      ).unref(),
    ),
  ]);
