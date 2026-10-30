import { describe, expect, it } from 'vitest';
import type { HttpRequest } from '../../../src/clients/http';
import type { DateQuery } from '../../../src/discover/dateReader';
import { stellar } from '../../../src/discover/readers/stellar';
import { answering, fakeDiscoverDeps } from '../../fakes/discover';

const ISSUER = 'GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6';
const CONTRACT = 'CDV6U7OEVY6KUEJ4WNS63AYB6RFU3BAE7AZJOQ7LPH447C6NWUXEZZSO';
const query = (address: string): DateQuery => ({ chain: 'stellar', address });
const operation = (type: string, created_at: string, extra = {}) => ({
  id: `op-${created_at}`,
  type,
  created_at,
  ...extra,
});
const payment = { asset_code: 'USDY', asset_issuer: ISSUER, from: ISSUER };

const horizon = (records: unknown[]) =>
  answering(({ url }: HttpRequest) =>
    url.includes('stellar.expert') ? { created: 1756340239 } : { _embedded: { records }, _links: {} },
  );

describe('stellar date reader', () => {
  it("dates a classic asset at the issuer's first issuing payment when Horizon holds the issuer's creation", async () => {
    const http = horizon([
      operation('create_account', '2025-08-27T10:00:00Z'),
      operation('payment', '2025-08-28T09:00:00Z', { asset_code: 'XLM' }),
      operation('payment', '2025-08-29T09:00:00Z', payment),
    ]);
    const [result] = await stellar.read([query(`USDY-${ISSUER}`)], fakeDiscoverDeps({ http }));

    expect(result).toMatchObject({ date: '2025-08-29', basis: 'first-issue' });
  });

  it('asks stellar.expert when Horizon history no longer reaches the issuer, and for a contract', async () => {
    const http = horizon([operation('payment', '2025-09-11T15:22:57Z', payment)]);
    const [cut, contract] = await stellar.read([query(`USDY-${ISSUER}`), query(CONTRACT)], fakeDiscoverDeps({ http }));

    expect(cut).toMatchObject({ date: '2025-08-28', basis: 'asset-created' });
    expect(contract).toMatchObject({
      basis: 'contract-created',
      source: expect.stringContaining(`/contract/${CONTRACT}`),
    });
  });
});
