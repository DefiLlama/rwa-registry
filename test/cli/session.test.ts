import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addAsset } from '../../src/cli/commands/add-asset';
import { addUnderlying } from '../../src/cli/commands/add-underlying';
import { Session } from '../../src/cli/session';
import { toRow } from '../../src/schema';
import { baseTree, tslaxFile, writeTree } from '../fixtures/tree';

// A TSLAx-like sheet row of its own symbol, id and address, on the underlying given.
const asset = (symbol: string, legacyId: number, underlying: string) => ({
  platform: 'xstocks',
  ...toRow('asset', tslaxFile()),
  slug: symbol.toLowerCase(),
  symbol,
  canonicalMarketId: symbol,
  legacyId,
  underlying,
  deployments: [{ chain: 'ethereum', address: `0x${String(legacyId).padStart(40, '0')}`, primary: true }],
});

const session = (root: string, batchSize = 250) =>
  new Session(root, { dryRun: false, patches: mkdtempSync(join(tmpdir(), 'rwa-patches-')), batchSize, base: 'none' });

describe('Session', () => {
  it('holds the call whose file a batch check names and lands the others of its batch', async () => {
    const root = writeTree(baseTree());
    const landing = session(root);

    await landing.land({ id: 'nvdax', command: addAsset, input: { template: asset('NVDAx', 258, 'tesla-inc') } });
    await landing.land({ id: 'ghost', command: addAsset, input: { template: asset('GHOSTx', 259, 'no-such-inc') } });
    await landing.land({ id: 'aaplx', command: addAsset, input: { template: asset('AAPLx', 260, 'tesla-inc') } });
    const outcomes = await landing.finish();

    expect(outcomes.map(({ id, status }) => [id, status])).toEqual([
      ['nvdax', 'added'],
      ['ghost', 'held'],
      ['aaplx', 'added'],
    ]);
    expect(outcomes[1]!.reason).toMatch(/underlying names underlying no-such-inc, which does not exist$/);
    expect(['nvdax', 'ghostx', 'aaplx'].map((slug) => existsSync(join(root, `assets/xstocks/${slug}.json`)))).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('holds a call whose schema fails at once, and a later call of the batch sees what the earlier ones staged', async () => {
    const root = writeTree(baseTree());
    const landing = session(root, 2);
    const underlying = (slug: string, exposure: string) => ({
      template: { class: 'equity', slug, name: slug, exposure },
    });

    await landing.land({ id: 'bad', command: addUnderlying, input: underlying('bad-inc', 'no-such-group') });
    await landing.land({
      id: 'nvidia',
      command: addUnderlying,
      input: underlying('nvidia-corporation', 'public-equities'),
    });
    await landing.land({
      id: 'nvdax',
      command: addAsset,
      input: { template: asset('NVDAx', 258, 'nvidia-corporation') },
    });
    const outcomes = await landing.finish();

    expect(outcomes.map(({ id, status }) => [id, status])).toEqual([
      ['bad', 'held'],
      ['nvidia', 'added'],
      ['nvdax', 'added'],
    ]);
    expect(outcomes[0]!.reason).toContain('"no-such-group" is not in vocabulary asset-group');
    expect(existsSync(join(root, 'reference/underlyings/equity/bad-inc.json'))).toBe(false);
  });
});
