/**
 * The clients layer's errors, each naming its source and the reason its outputs carry, and never a URL, since a URL may hold a key.
 * @dev review: src/clients/http.ts
 */
import type { Reason } from './reasons';
import { RwaError } from './rwaError';

export class ClientError extends RwaError {
  readonly source: string;
  readonly reason: Reason;

  constructor(at: { source: string; reason: Reason; message: string; cause?: unknown }) {
    super('clients', `${at.source}: ${at.message}`, { cause: at.cause });
    this.source = at.source;
    this.reason = at.reason;
  }
}

export class RateLimitedError extends ClientError {}
export class TimeoutError extends ClientError {}
export class HttpStatusError extends ClientError {}
export class ResponseShapeError extends ClientError {}
