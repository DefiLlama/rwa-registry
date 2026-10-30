import { describe, expect, it } from 'vitest';
import { SchemaError } from '../../src/errors';
import { parseRow } from '../../src/schema';
import { tslaxWith } from '../fixtures/tree';

const vocabularies = {
  category: ['stocks-equities', 'fiat-stablecoins'],
  'asset-class': ['stock-backed'],
  'asset-group': ['public-equities'],
  type: ['asset'],
  'rwa-classification': ['rwa'],
  'role-kind': ['issuer'],
  'label-kind': ['excluded-holder'],
};
const file = 'assets/xstocks/tslax.json';

describe('parseRow', () => {
  it('names the nearest value on a vocabulary typo', () => {
    const errors = parseRow('asset', tslaxWith({ structure: 'stock-backd' }), file, { vocabularies });

    expect(errors).toHaveLength(1);
    const [error] = errors as SchemaError[];
    expect(error).toBeInstanceOf(SchemaError);
    expect(error).toMatchObject({
      file,
      path: 'class.structure',
      message: expect.stringMatching(/did you mean stock-backed$/),
    });
  });

  it("keeps an asset's document links and fails one that is not a URL", () => {
    const documents = ['https://ipfs.io/ipfs/QmYmAcvbm3MmKTBRneRdG1Nw15SQpEnPEK5vkkdkv5hKuT'];
    const parsed = parseRow('asset', tslaxWith({ documents }), file, { vocabularies });
    const errors = parseRow('asset', tslaxWith({ documents: [documents[0], 'N/A (private)'] }), file, { vocabularies });

    expect(parsed).toMatchObject({ sources: { documents } });
    expect(errors).toEqual([expect.objectContaining({ path: 'sources.documents[1]' })]);
  });

  it("refuses a twitter link on an asset, since its platform holds the asset's social links", () => {
    const links = { website: ['https://xstocks.com/'], twitter: 'https://x.com/xStocksFi' };
    const errors = parseRow('asset', tslaxWith({ links }), file, { vocabularies });

    expect(errors).toEqual([expect.objectContaining({ path: 'about.links.twitter' })]);
  });

  it('refuses aliases on an underlying, since its one name is the legal name', () => {
    const tesla = { slug: 'tesla-inc', name: 'Tesla, Inc.', aliases: ['TESLA INC'], exposure: 'public-equities' };
    const errors = parseRow('underlying', tesla, 'reference/underlyings/equity/tesla-inc.json', { vocabularies });

    expect(errors).toEqual([expect.objectContaining({ path: 'aliases' })]);
  });

  it("keeps a deployment's date basis and refuses one outside the vocabulary", () => {
    const leg = { chain: 'solana', address: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', deployedAt: '2025-06-30' };
    const parsed = parseRow(
      'asset',
      tslaxWith({ deployments: [{ ...leg, deployedAtBasis: 'issuer-announcement' }] }),
      file,
      { vocabularies },
    );
    const errors = parseRow('asset', tslaxWith({ deployments: [{ ...leg, deployedAtBasis: 'first-seen' }] }), file, {
      vocabularies,
    });

    expect(parsed).toMatchObject({ deployments: [{ deployedAtBasis: 'issuer-announcement' }] });
    expect(errors).toEqual([expect.objectContaining({ path: 'deployments[0].deployedAtBasis' })]);
  });

  it('keeps the five platform fee fields the sheet fills', () => {
    const fees = {
      yieldSpreadRetainedBps: 50,
      platformSetupFeeUsd: 25000,
      platformRecurringServiceFeeUsdPerYr: 12000,
      prospectusUrl: 'https://example.com/prospectus.pdf',
      feeWaiverEndDate: '2026-12-31',
    };
    const platform = { identity: { slug: 'xstocks', name: 'xStocks' }, platform: { fees } };

    expect(parseRow('organization', platform, 'assets/xstocks/platform.json', { vocabularies })).toMatchObject({
      platform: { fees },
    });
  });
});
