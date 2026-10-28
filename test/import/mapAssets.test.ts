import { describe, expect, it } from 'vitest';
import { importContext } from '../../src/import/importContext';
import { mapAssets, NO_CONTRACT } from '../../src/import/mapAssets';
import type { ExportRow } from '../../src/import/readExport';
import { assetRow, platformRow } from '../fixtures/import/rows';

const map = (markets: ExportRow[], platforms = [platformRow()]) => {
  const exports = { markets, platforms };
  return mapAssets(exports, importContext(exports, {}));
};

describe('mapAssets', () => {
  it('lists a malformed contract item and writes no deployment for it', () => {
    const { files, unmapped } = map([assetRow({ Contracts: 'ethereum:0x123' })]);

    expect(files.get('assets/xstocks/tslax.json')!.deployments).toBeUndefined();
    expect(unmapped.filter((row) => row.column !== 'Chain')).toEqual([
      expect.objectContaining({ id: '257', column: 'Contracts', value: 'ethereum:0x123' }),
    ]);
  });

  it('imports an xrpl row as an asset and lists a platform-shaped row and a blank row', () => {
    const hat = assetRow({
      '*RWA ID': '4476',
      Ticker: 'HAT',
      'Canonical Market ID': 'xrpl:HAT',
      'Primary Chain': 'xrpl',
      Contracts: 'xrpl:HAT:rKVBRCYxHx674PfsnZPbznmNuoJyQk4ALG',
    });
    const platformShaped = assetRow({ '*RWA ID': '3234', Type: 'Platform', Contracts: 'x', Delisted: 'TRUE' });
    const blank = assetRow(
      Object.fromEntries(Object.keys(assetRow()).map((column) => [column, column === '*RWA ID' ? '137' : 'x'])),
    );

    const { files, unmapped } = map([hat, platformShaped, blank]);

    expect([...files.keys()]).toEqual(['assets/xstocks/xrpl-hat.json']);
    expect(unmapped.filter((row) => row.column !== 'Chain').map((row) => row.id)).toEqual(['3234', '137']);
  });

  it('gives the higher legacy id of a case collision a suffix', () => {
    const { files } = map([
      assetRow({ '*RWA ID': '4679', 'Canonical Market ID': 'rCOIN', Contracts: '' }),
      assetRow({ '*RWA ID': '76', 'Canonical Market ID': 'RCOIN', Contracts: '' }),
    ]);

    expect([...files.keys()].sort()).toEqual(['assets/xstocks/rcoin-4679.json', 'assets/xstocks/rcoin.json']);
  });

  it('writes one issuer role per item, so the roles joined give the cell', () => {
    const { files } = map([assetRow({ Issuer: 'Backed Assets (JE) Limited; tokenized by STOKR' })]);
    const roles = files.get('assets/xstocks/tslax.json')!.roles as { organization: string }[];

    expect(roles).toEqual([
      { organization: 'backed-assets-je-limited', kind: 'issuer' },
      { organization: 'tokenized-by-stokr', kind: 'issuer' },
    ]);
  });

  it('writes one ISIN on every asset row that carries it, so the check lists it as a warning', () => {
    const { files, unmapped } = map([
      assetRow({ ISIN: 'US88160R1014' }),
      assetRow({ '*RWA ID': '300', 'Canonical Market ID': 'wTSLAx', Contracts: '', ISIN: 'US88160R1014' }),
    ]);
    const isinOf = (path: string) => (files.get(path)!.identifiers as { value: string }[]).map((item) => item.value);

    expect(isinOf('assets/xstocks/tslax.json')).toEqual(['US88160R1014']);
    expect(isinOf('assets/xstocks/wtslax.json')).toEqual(['US88160R1014']);
    expect(unmapped.filter((row) => row.column === 'ISIN')).toEqual([]);
  });

  it('writes an attestation cell of prose as an undated attestation with the prose as its note', () => {
    const { files } = map([
      assetRow({ Attestations: 'TRUE', 'Date of Last Attestation': 'monthly, see the reports page' }),
    ]);

    expect(files.get('assets/xstocks/tslax.json')!.events).toEqual([
      { kind: 'attestation', note: 'monthly, see the reports page' },
    ]);
  });

  it('keeps the Llama Attestation Proof as a link, x as false and an empty cell as nothing, and lists any other text', () => {
    const { files, unmapped } = map([
      assetRow({ 'Llama Attestation Proof': 'x' }),
      assetRow({
        '*RWA ID': '300',
        'Canonical Market ID': 'A',
        Contracts: '',
        'Llama Attestation Proof': 'https://proof.example/1',
      }),
      assetRow({ '*RWA ID': '301', 'Canonical Market ID': 'B', Contracts: '', 'Llama Attestation Proof': '' }),
      assetRow({ '*RWA ID': '302', 'Canonical Market ID': 'C', Contracts: '', 'Llama Attestation Proof': 'pending' }),
    ]);
    const proofOf = (path: string) => files.get(path)!.llamaAttestationProof;

    expect(proofOf('assets/xstocks/tslax.json')).toBe(false);
    expect(proofOf('assets/xstocks/a.json')).toBe('https://proof.example/1');
    expect(proofOf('assets/xstocks/b.json')).toBeUndefined();
    expect(proofOf('assets/xstocks/c.json')).toBeUndefined();
    expect(unmapped.filter((row) => row.column === 'Llama Attestation Proof')).toEqual([
      expect.objectContaining({ id: '302', value: 'pending', reason: 'neither a link nor x' }),
    ]);
  });

  it('leaves a blank Suspicious, Delisted, Llama Grade Attestation or active mcap data cell out, and keeps a FALSE as false', () => {
    const flags = {
      Suspicious: 'FALSE',
      Delisted: 'FALSE',
      'Llama Grade Attestation': 'FALSE',
      'active mcap data': 'FALSE',
    };
    const blanks = { Suspicious: '', Delisted: '', 'Llama Grade Attestation': '', 'active mcap data': '' };
    const { files } = map([
      assetRow(flags),
      assetRow({ '*RWA ID': '300', 'Canonical Market ID': 'A', Contracts: '', ...blanks }),
    ]);
    const fieldsOf = (path: string) => {
      const { suspicious, delisted, llamaGradeAttestation, activeMcapReviewed } = files.get(path)!;
      return { suspicious, delisted, llamaGradeAttestation, activeMcapReviewed };
    };

    expect(fieldsOf('assets/xstocks/tslax.json')).toEqual({
      suspicious: false,
      delisted: false,
      llamaGradeAttestation: false,
      activeMcapReviewed: false,
    });
    expect(fieldsOf('assets/xstocks/a.json')).toEqual({
      suspicious: undefined,
      delisted: undefined,
      llamaGradeAttestation: undefined,
      activeMcapReviewed: null,
    });
  });

  it('ends a retired id with an undated retirement event', () => {
    const { files } = map([assetRow({ '*RWA ID': '386' })]);

    expect(files.get('assets/xstocks/tslax.json')!.events).toEqual([
      expect.objectContaining({ kind: 'retirement', date: null }),
    ]);
  });

  it('lists a row whose Reference Ticker differs from the ticker its underlying publishes', () => {
    const { unmapped } = map([
      assetRow(),
      assetRow({ '*RWA ID': '258', 'Canonical Market ID': 'TSLAy', Ticker: 'TSLAy' }),
      assetRow({ '*RWA ID': '259', 'Canonical Market ID': 'wTSLAx', Ticker: 'wTSLAx', 'Reference Ticker': 'TSLAx' }),
    ]);

    expect(unmapped).toEqual([
      expect.objectContaining({
        id: '259',
        column: 'Reference Ticker',
        value: 'TSLAx',
        reason: expect.stringContaining('TSLA'),
      }),
    ]);
  });

  it('writes the deployments and holders of a merged chain spelling on one chain row that keeps the other as an alias', () => {
    const exports = {
      markets: [
        assetRow({
          Chain: 'avax',
          Contracts: `avalanche:0x${'a'.repeat(40)}; avax:0x${'b'.repeat(40)}`,
          '*Holders to be Removed for Active Marketcap': `avalanche:0x${'c'.repeat(40)}`,
        }),
      ],
      platforms: [platformRow()],
    };
    const context = importContext(exports, {});
    const { files } = mapAssets(exports, context);
    const deployments = files.get('assets/xstocks/tslax.json')!.deployments as { chain: string; labels: unknown[] }[];

    expect(deployments.map((row) => [row.chain, row.labels.length])).toEqual([
      ['avax', 1],
      ['avax', 1],
    ]);
    expect([...context.chains.files(new Map()).keys()].filter((path) => /avax|avalanche/.test(path))).toEqual([
      'reference/chains/avax.json',
    ]);
    expect(
      (context.chains.files(new Map()).get('reference/chains/avax.json') as { aliases: string[] }).aliases,
    ).toEqual(['avalanche']);
  });

  it('keeps a parent protocol id as written beside the numeric ids', () => {
    const { files, unmapped } = map([assetRow({ '*projectID': '1599; 111; parent#aave' })]);

    expect(files.get('assets/xstocks/tslax.json')!.issuerProtocolIds).toEqual([1599, 111, 'parent#aave']);
    expect(unmapped.filter((row) => row.column === '*projectID')).toEqual([]);
  });

  it('keeps an ISIN an underlying holds on the asset too, and an annotated cell as its note', () => {
    const { files } = map([
      assetRow({ ISIN: 'CH1436219252 (Backed cert); US88160R1014 (underlying TSLA)' }),
      assetRow({ '*RWA ID': '300', 'Canonical Market ID': 'TSLAon', Ticker: 'TSLAon', ISIN: 'US88160R1014' }),
    ]);
    const sources = (path: string) => {
      const file = files.get(path)!;
      return [(file.identifiers as { value: string }[]).map((item) => item.value), file.isinNote];
    };

    expect(sources('assets/xstocks/tslax.json')).toEqual([
      ['CH1436219252'],
      'CH1436219252 (Backed cert); US88160R1014 (underlying TSLA)',
    ]);
    expect(sources('assets/xstocks/tslaon.json')).toEqual([['US88160R1014'], undefined]);
  });

  it('lists a Chain item with no contract on that chain, since a deployment needs an address', () => {
    const { files, unmapped } = map([
      assetRow({
        Chain: 'ethereum; polygon; gnosis',
        Contracts: `ethereum:0x${'a'.repeat(40)}; xdai:0x${'b'.repeat(40)}`,
      }),
    ]);

    expect((files.get('assets/xstocks/tslax.json')!.deployments as unknown[]).length).toBe(2);
    expect(unmapped.filter((row) => row.column === 'Chain')).toEqual([
      { id: '257', column: 'Chain', value: 'polygon', reason: NO_CONTRACT, batch: 'call after cutover' },
    ]);
  });

  it("keeps the asset's own Issuer Registry Info, which the issuer organization's text no longer replaces", () => {
    const { files } = map([assetRow({ 'Issuer Registry Info': 'Backed Assets (JE) Limited, Jersey 128349' })]);

    expect(files.get('assets/xstocks/tslax.json')!.registryInfo).toBe('Backed Assets (JE) Limited, Jersey 128349');
  });
});
