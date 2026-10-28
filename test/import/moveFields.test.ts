import { describe, expect, it } from 'vitest';
import { moveFields } from '../../src/import/moveFields';
import type { RegistryFiles } from '../../src/import/importTypes';

describe('moveFields', () => {
  it('moves the protocol ids onto the issuer role, and keeps them on an asset with no issuer role', () => {
    const asset = (roles: unknown[]) => ({
      slug: 'susds',
      legacyId: 8817,
      primaryChain: 'ethereum',
      issuerProtocolIds: [118],
      activeMcapReviewed: true,
      roles,
    });
    const { files, calls } = moveFields(
      new Map([
        ['assets/sky/susds.json', asset([{ organization: 'sky', kind: 'issuer' }])],
        ['assets/sky/sdai.json', asset([{ organization: 'sky', kind: 'oracle' }])],
      ]) as RegistryFiles,
    );

    expect(files.get('assets/sky/susds.json')).toMatchObject({ roles: [{ protocolIds: [118] }] });
    expect(files.get('assets/sky/susds.json')).not.toHaveProperty('protocolIds');
    expect(files.get('assets/sky/sdai.json')).toMatchObject({ protocolIds: [118], roles: [{ kind: 'oracle' }] });
    expect(calls.map((call) => call.line)).toContain(
      'protocol ids with no issuer role to hold them, kept on the asset: 8817',
    );
  });

  it('writes activeAumReviewed from a stated cell and leaves it out for a blank one', () => {
    const asset = (activeMcapReviewed: boolean | null) => ({
      slug: 'a',
      legacyId: 1,
      primaryChain: 'ethereum',
      activeMcapReviewed,
    });
    const { files } = moveFields(
      new Map([
        ['assets/sky/a.json', asset(false)],
        ['assets/sky/b.json', asset(null)],
      ]) as RegistryFiles,
    );

    expect(files.get('assets/sky/a.json')).toMatchObject({ activeAumReviewed: false });
    expect(files.get('assets/sky/b.json')).not.toHaveProperty('activeAumReviewed');
  });
});
