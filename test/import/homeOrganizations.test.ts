import { describe, expect, it } from 'vitest';
import { homeOrganizations } from '../../src/import/homeOrganizations';
import type { FileJson } from '../../src/import/importTypes';

const role = (organization: string, kind: string) => ({ organization, kind });

describe('homeOrganizations', () => {
  it('files each organization under its home: venue operator, platform, the kind of the roles it holds most, else unassigned', () => {
    const staged = new Map<string, FileJson>([
      ['assets/xstocks/platform.json', { slug: 'xstocks', name: 'xStocks', kind: 'platform' }],
      ['assets/xstocks/tslax.json', { slug: 'tslax', roles: [role('backed', 'issuer'), role('chainlink', 'oracle')] }],
      ['assets/xstocks/nvdax.json', { slug: 'nvdax', roles: [role('backed', 'issuer'), role('backed', 'oracle')] }],
      ['perps/xyz/venue.json', { slug: 'xyz', organization: 'trade-xyz' }],
      ['reference/organizations/backed.json', { slug: 'backed', name: 'Backed', kind: 'entity' }],
      ['reference/organizations/chainlink.json', { slug: 'chainlink', name: 'Chainlink', kind: 'brand' }],
      ['reference/organizations/trade-xyz.json', { slug: 'trade-xyz', name: 'trade[XYZ]', kind: 'platform' }],
      ['reference/organizations/midas-rwa.json', { slug: 'midas-rwa', name: 'Midas RWA', kind: 'platform' }],
      ['reference/organizations/zodiac.json', { slug: 'zodiac', name: 'Zodiac', kind: 'entity' }],
    ]);

    const { files, calls } = homeOrganizations(staged);

    expect([...files.keys()].filter((path) => !path.includes('tslax') && !path.includes('nvdax')).sort()).toEqual([
      'assets/midas-rwa/platform.json',
      'assets/xstocks/platform.json',
      'perps/xyz/organization.json',
      'perps/xyz/venue.json',
      'reference/organizations/issuer/backed.json',
      'reference/organizations/oracle/chainlink.json',
      'reference/organizations/unassigned/zodiac.json',
    ]);
    expect(files.get('reference/organizations/issuer/backed.json')).toEqual({ slug: 'backed', name: 'Backed' });
    expect(calls.map((call) => call.line)).toEqual([
      expect.stringContaining('1 Platforms tab rows hold no asset'),
      expect.stringContaining('1 organizations hold no role'),
    ]);
  });
});
