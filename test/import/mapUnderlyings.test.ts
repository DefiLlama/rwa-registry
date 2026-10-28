import { describe, expect, it } from 'vitest';
import type { FileJson } from '../../src/import/importTypes';
import { mapUnderlyings, withoutUntracked } from '../../src/import/mapUnderlyings';
import { assetRow, perpsRow } from '../fixtures/import/rows';

describe('mapUnderlyings', () => {
  it('writes one underlying per Reference Asset spelling', () => {
    const { underlyings, slugOf } = mapUnderlyings([
      assetRow({ 'Reference Asset': 'Tesla, Inc.' }),
      perpsRow({ 'Reference Asset': 'Tesla Inc' }),
    ]);

    expect([...underlyings.keys()]).toEqual(['tesla-inc', 'tesla-inc-2921']);
    expect([slugOf('Tesla, Inc.'), slugOf('Tesla Inc')]).toEqual(['tesla-inc', 'tesla-inc-2921']);
  });

  it('copies an underlying ISIN from the sheet with no source, unverified', () => {
    const { underlyings } = mapUnderlyings([assetRow({ ISIN: 'US88160R1014 (underlying)' })]);

    expect(underlyings.get('tesla-inc')?.identifiers).toEqual([
      { scheme: 'isin', value: 'US88160R1014', source: null, verified: false },
    ]);
  });

  it('takes the class and the exposure from the Asset Group and the currency from an .FX ticker', () => {
    const { underlyings, currencies } = mapUnderlyings([
      perpsRow({ 'Reference Asset': 'Euro', 'Reference Ticker': 'EUR.FX', 'Asset Group': 'Fiat Currencies' }),
    ]);

    expect(underlyings.get('euro')).toEqual({
      slug: 'euro',
      name: 'Euro',
      ticker: 'EUR.FX',
      class: 'fx',
      exposure: 'fiat-currencies',
      currency: 'eur',
    });
    expect(currencies).toEqual(['EUR']);
  });

  it('drops an underlying only perps rows spell once no market tracks it, after the patches moved them to the token', () => {
    const { perpsOnly } = mapUnderlyings([
      perpsRow({ 'Reference Asset': 'Pax Gold', 'Canonical Market ID': 'kraken:PAXG' }),
      perpsRow({ 'Reference Asset': 'Euro', 'Canonical Market ID': 'xyz:EUR' }),
      assetRow({ 'Reference Asset': 'Tesla, Inc.' }),
    ]);
    const files = new Map<string, FileJson>([
      ['perps/kraken/paxg.json', { venue: 'kraken', symbol: 'PAXG', tracksAsset: 'paxg' }],
      ['perps/xyz/eur.json', { venue: 'xyz', symbol: 'EUR', tracks: 'euro' }],
      ['reference/underlyings/euro.json', { slug: 'euro' }],
      ['reference/underlyings/pax-gold.json', { slug: 'pax-gold' }],
      ['reference/underlyings/tesla-inc.json', { slug: 'tesla-inc' }],
    ]);

    expect([...withoutUntracked(files, perpsOnly).keys()]).toEqual([
      'perps/kraken/paxg.json',
      'perps/xyz/eur.json',
      'reference/underlyings/euro.json',
      'reference/underlyings/tesla-inc.json',
    ]);
  });
});
