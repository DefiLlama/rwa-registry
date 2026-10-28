import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttp } from '../../src/clients/http';
import { HttpStatusError, RateLimitedError, ResponseShapeError, TimeoutError } from '../../src/errors';

const LIMITS = { timeoutMs: 30_000, connectTimeoutMs: 30_000 };
const KEYED_URL = 'https://pro-api.llama.fi/secret-key/stablecoins';
const answering = (response: () => Promise<Response>) => createHttp(LIMITS, (() => response()) as typeof fetch);

describe('createHttp', () => {
  it('turns a 429 into RateLimitedError with reason rate-limited and no URL in the message', async () => {
    const error = await answering(async () => new Response('', { status: 429 }))
      .json({ label: 'stablecoins', url: KEYED_URL })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error).toMatchObject({ reason: 'rate-limited', source: 'stablecoins' });
    expect((error as Error).message).not.toContain('secret-key');
  });

  it('names a non-ok status, a body that is not JSON and an aborted request', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'TimeoutError' });

    await expect(
      answering(async () => new Response('', { status: 502 })).json({ label: 'coins', url: KEYED_URL }),
    ).rejects.toBeInstanceOf(HttpStatusError);
    await expect(
      answering(async () => new Response('<html>')).json({ label: 'coins', url: KEYED_URL }),
    ).rejects.toBeInstanceOf(ResponseShapeError);
    await expect(
      answering(() => Promise.reject(aborted)).json({ label: 'coins', url: KEYED_URL }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('names the network cause of a failed request and never its URL', async () => {
    const refused = new TypeError('fetch failed', {
      cause: Object.assign(new Error(KEYED_URL), { code: 'ECONNREFUSED' }),
    });
    const error: unknown = await answering(() => Promise.reject(refused))
      .json({ label: 'coins', url: KEYED_URL })
      .catch((caught: unknown) => caught);

    expect((error as Error).message).toContain('ECONNREFUSED');
    expect((error as Error).message).not.toContain(KEYED_URL);
  });

  // A server that takes the connection and never answers the TLS handshake, as slow hosts do.
  let silent: Server | undefined;
  afterEach(() => silent?.close());

  it('gives up a connection after connectTimeoutMs, well before the request timeout', async () => {
    silent = createServer((socket) => socket.on('error', () => {}));
    await new Promise<void>((done) => silent!.listen(0, '127.0.0.1', done));
    const { port } = silent.address() as { port: number };
    const http = createHttp({ timeoutMs: 60_000, connectTimeoutMs: 200 });

    const error = await http.json({ label: 'etherscan', url: `https://127.0.0.1:${port}/` }).catch((caught) => caught);

    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).toMatchObject({ reason: 'timeout', source: 'etherscan' });
  });
});
