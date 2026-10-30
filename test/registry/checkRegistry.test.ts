import { describe, expect, it } from 'vitest';
import { checkRegistry, type Problem } from '../../src/registry';
import {
  assetFile,
  baseTree,
  contractlessTslax,
  load,
  marketWith,
  registryOf,
  tslaMarketFile,
  tslaxFile,
  tslaxWith,
  withClass,
  xstocksPlatform,
  xyzVenue,
  ackFile,
} from '../fixtures/tree';

const tslax = tslaxFile();
const errorsIn = (problems: Problem[]) => problems.filter((problem) => problem.severity === 'error');

describe('checkRegistry', () => {
  it('fails a reference that names nothing and a role target outside its tables', () => {
    const head = registryOf({ ...baseTree(), 'assets/xstocks/tslax.json': tslaxWith({ underlying: 'tesla-incc' }) });
    const [dangling] = checkRegistry(head);
    const base = registryOf(baseTree());
    const roleOnValue = { organization: 'backed-assets-je-limited', kind: 'issuer', target: { table: 'vocabulary' as const, key: 'type:asset' } };

    expect(checkRegistry(head)).toHaveLength(1);
    expect(dangling).toMatchObject({ error: 'DanglingReferenceError', file: 'assets/xstocks/tslax.json' });
    expect(checkRegistry({ ...base, role: [...base.role, roleOnValue] })).toEqual([
      expect.objectContaining({ error: 'DanglingReferenceError' }),
    ]);
  });

  it('takes an asset or an fx underlying as a market collateral and fails any other slug', () => {
    const base = baseTree();
    const fiat = { slug: 'fiat-currencies', label: 'Fiat Currencies', class: 'fx' };
    const withCollateral = (collateral: string) =>
      checkRegistry(
        registryOf({
          ...base,
          'reference/vocabularies/asset-group.json': [...(base['reference/vocabularies/asset-group.json'] as object[]), fiat],
          'reference/underlyings/fx/us-dollar.json': { slug: 'us-dollar', name: 'US Dollar', exposure: 'fiat-currencies' },
          'perps/xyz/tsla.json': marketWith({ collateral }),
        }),
      );

    expect(withCollateral('us-dollar')).toEqual([]);
    expect(withCollateral('tesla-inc')).toEqual([
      expect.objectContaining({ error: 'DanglingReferenceError', path: 'terms.collateral' }),
    ]);
  });

  it('fails a cycle on wraps', () => {
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'assets/xstocks/a.json': assetFile('a', 9001, { type: 'wrapper', wraps: 'b' }),
        'assets/xstocks/b.json': assetFile('b', 9002, { type: 'wrapper', wraps: 'a' }),
      }),
    );

    expect(problems).toEqual([expect.objectContaining({ error: 'CycleError' })]);
  });

  it('only warns on a deployment with an address and no deployedAt', () => {
    const undated = { chain: 'ethereum', address: `0x${'1'.repeat(40)}`, deployedAt: null };
    const head = registryOf({
      ...baseTree(),
      'assets/xstocks/tslax.json': { ...tslax, deployments: [...tslax.deployments, undated] },
    });

    expect(checkRegistry(head)).toEqual([expect.objectContaining({ error: 'UndatedDeploymentError', severity: 'warning' })]);
  });

  it('only warns on a chain with no known contract and asks it for no date', () => {
    const head = registryOf({ ...baseTree(), 'assets/xstocks/tslax.json': contractlessTslax() });

    expect(checkRegistry(head)).toEqual([
      expect.objectContaining({ error: 'ContractlessDeploymentError', severity: 'warning', path: 'deployments[2].address' }),
    ]);
  });

  it('fails a second deployment with no known contract on the same chain of one asset', () => {
    const contractless = contractlessTslax();
    const twice = { ...contractless, deployments: [...contractless.deployments, { chain: 'base' }] };

    expect(errorsIn(checkRegistry(registryOf({ ...baseTree(), 'assets/xstocks/tslax.json': twice })))).toEqual([
      expect.objectContaining({ error: 'DuplicateKeyError', message: expect.stringContaining('tslax|base') }),
    ]);
  });

  it('only warns on an undated event with no note, link or reason, and on a suspicious review with no reason', () => {
    const head = registryOf({
      ...baseTree(),
      'assets/xstocks/tslax.json': {
        ...tslax,
        events: [
          { kind: 'review', outcome: 'suspicious' },
          { kind: 'delisting', note: 'last stored day not given' },
          { kind: 'delisting', links: ['https://xstocks.com/'] },
          { kind: 'delisting', reason: 'the issuer wound the token down' },
        ],
      },
    });
    const notes = (problems: ReturnType<typeof checkRegistry>) =>
      problems
        .filter((problem) => ['UndatedEventError', 'MissingReasonError'].includes(problem.error))
        .map((problem) => `${problem.error} ${problem.severity}`);

    expect(notes(checkRegistry(head))).toEqual(['UndatedEventError warning', 'MissingReasonError warning']);
  });

  it('fails a market that tracks nothing', () => {
    const { tracks: _, ...market } = tslaMarketFile();
    const problems = checkRegistry(registryOf({ ...baseTree(), 'perps/xyz/tsla.json': market }));

    expect(problems).toEqual([expect.objectContaining({ error: 'MarketTrackError', file: 'perps/xyz/tsla.json' })]);
  });

  it('fails a legacy id an asset and a market share', () => {
    const { problems } = load({ ...baseTree(), 'perps/xyz/tsla.json': marketWith({ legacyId: 257 }) });

    expect(errorsIn(problems)).toEqual([
      expect.objectContaining({ error: 'DuplicateKeyError', message: expect.stringContaining('legacyId 257') }),
    ]);
  });

  it('fails two markets whose lowercase ids are equal', () => {
    const registry = registryOf(baseTree());
    const lower = { ...registry.perp_market[0], symbol: 'tsla', legacyId: null };

    expect(checkRegistry({ ...registry, perp_market: [...registry.perp_market, lower] })).toEqual([
      expect.objectContaining({ error: 'DuplicateKeyError', message: expect.stringContaining('xyz:tsla') }),
    ]);
  });

  it('only warns on one ISIN on assets of different underlyings, never on one underlying, its assets included', () => {
    const isin = { scheme: 'isin', value: 'US88160R1014' };
    const sharing = (tree: Record<string, unknown>) =>
      checkRegistry(registryOf({ ...baseTree(), 'assets/xstocks/tslax.json': tslaxWith({ identifiers: [isin] }), ...tree }));
    const oneUnderlying = sharing({
      'assets/xstocks/wtslax.json': assetFile('wtslax', 9001, { identifiers: [isin] }),
      'reference/underlyings/equity/tesla-inc.json': { slug: 'tesla-inc', name: 'Tesla, Inc.', exposure: 'public-equities', identifiers: [isin] },
    });
    const twoUnderlyings = sharing({
      'reference/underlyings/equity/rivian.json': { slug: 'rivian', name: 'Rivian', exposure: 'public-equities' },
      'assets/xstocks/rivnx.json': assetFile('rivnx', 9002, { underlying: 'rivian', identifiers: [isin] }),
    });

    expect(oneUnderlying).toEqual([]);
    expect(twoUnderlyings).toEqual([expect.objectContaining({ error: 'SharedIsinError', severity: 'warning' })]);
  });

  it('fails a holder label that is not in its family form', () => {
    const [solana, ethereum] = tslax.deployments;
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'assets/xstocks/tslax.json': {
          ...tslax,
          deployments: [solana, { ...ethereum, labels: [{ address: '0xNOTANADDRESS', kind: 'excluded-holder' }] }],
        },
      }),
    );

    expect(problems).toEqual([
      expect.objectContaining({ error: 'AddressFormatError', path: 'deployments[1].labels[0].address' }),
    ]);
  });

  it('fails two labels on one deployment that differ only in case', () => {
    const [solana, ethereum] = tslax.deployments;
    const label = solana.labels![0];
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'assets/xstocks/tslax.json': {
          ...tslax,
          deployments: [{ ...solana, labels: [label, { ...label, address: `s${label.address.slice(1)}` }] }, ethereum],
        },
      }),
    );

    expect(problems).toEqual([expect.objectContaining({ error: 'DuplicateKeyError' })]);
  });

  it('accepts a wrapper and a market on an asset', () => {
    const { problems } = load({
      ...baseTree(),
      'assets/xstocks/wtslax.json': assetFile('wtslax', 9001, { type: 'wrapper', wraps: 'tslax' }),
      'perps/xyz/wtslax.json': marketWith({ symbol: 'WTSLAX', legacyId: null, tracks: null, tracksAsset: 'wtslax' }),
    });

    expect(problems).toEqual([]);
  });

  it('fails an event kind on a table that kind cannot target', () => {
    const problems = checkRegistry(
      registryOf({ ...baseTree(), 'assets/xstocks/tslax.json': { ...tslax, events: [{ kind: 'split', date: '2026-06-01' }] } }),
    );

    expect(problems).toEqual([expect.objectContaining({ error: 'EventTargetError', file: 'assets/xstocks/tslax.json' })]);
  });

  it('fails a role whose from is after its to, an ack whose from is after its until, and a drift ack whose first day is after its last', () => {
    const role = { ...tslax.roles[0], from: '2026-06-01', to: '2026-05-01' };
    const why = { reason: 'test', resolve: 'test' };
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'assets/xstocks/tslax.json': { ...tslax, roles: [role] },
        '../acks/flows-hidden/tslax.json': ackFile({ until: '2026-01-01' }),
        '../acks/drift/chain-ethereum-2026-06-01.json': {
          slug: 'chain-ethereum-2026-06-01',
          series: 'chain/ethereum',
          firstDay: '2026-06-01',
          lastDay: '2026-05-01',
          ...why,
        },
      }),
    );

    expect(problems.map((problem) => [problem.error, problem.file, problem.path])).toEqual([
      ['DateOrderError', 'assets/xstocks/tslax.json', 'roles[0].from'],
      ['DateOrderError', '../acks/flows-hidden/tslax.json', 'from'],
      ['DateOrderError', '../acks/drift/chain-ethereum-2026-06-01.json', 'firstDay'],
    ]);
  });

  it('fails an ack naming an asset or a venue the registry does not hold', () => {
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        '../acks/flows-hidden/nope.json': ackFile({ slug: 'nope', asset: 'nope' }),
        '../acks/perps-venue/nope.json': { ...ackFile({ slug: 'nope', venue: 'nope' }), asset: undefined },
      }),
    );

    expect(problems.map((problem) => [problem.error, problem.file, problem.path])).toEqual([
      ['DanglingReferenceError', '../acks/flows-hidden/nope.json', 'asset'],
      ['DanglingReferenceError', '../acks/perps-venue/nope.json', 'venue'],
    ]);
  });

  it('fails an ack in a folder that is no ack kind, and an ack with a field of another kind or without one of its own', () => {
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        '../acks/flows/tslax.json': ackFile(),
        '../acks/single-point/tslax.json': ackFile({ day: '2026-06-01' }),
      }),
    );

    expect(problems.map((problem) => [problem.error, problem.file, problem.path])).toEqual([
      ['UnknownPathError', '../acks/flows/tslax.json', ''],
      ['SchemaError', '../acks/single-point/tslax.json', 'maxValueUsd'],
      ['SchemaError', '../acks/single-point/tslax.json', 'day'],
    ]);
  });

  it('fails a file named apart from its row slug', () => {
    const { 'assets/xstocks/tslax.json': asset, ...rest } = baseTree();
    const problems = checkRegistry(registryOf({ ...rest, 'assets/xstocks/tsla-x.json': asset }));

    expect(problems.map((problem) => [problem.error, problem.file])).toEqual([['FileNameError', 'assets/xstocks/tsla-x.json']]);
  });

  it('fails an event successor that names no deployment by chain and address', () => {
    const successor = { table: 'deployment', key: `ethereum:0x${'1'.repeat(40)}` };
    const { problems } = load({
      ...baseTree(),
      'assets/xstocks/tslax.json': { ...tslax, events: [{ kind: 'migration', date: '2026-01-01', successor }] },
    });

    expect(errorsIn(problems)).toEqual([expect.objectContaining({ error: 'DanglingReferenceError' })]);
  });

  it('fails a platform slug that is not rwaSlug of its name', () => {
    const misnamed = registryOf({
      ...baseTree(),
      'assets/backed/platform.json': { identity: { slug: 'backed', name: 'Backed Finance' }, platform: { primaryChain: 'solana' } },
      'assets/backed/btsla.json': assetFile('btsla', 9001),
    });

    expect(checkRegistry(misnamed)).toEqual([expect.objectContaining({ error: 'SlugRuleError' })]);
  });

  it('fails an address that does not match its family pattern', () => {
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'assets/xstocks/tslax.json': {
          ...tslax,
          deployments: [
            tslax.deployments[0],
            { chain: 'ethereum', address: '0x8AD3C73F833D3F9A523AB01476625F269AEB7CF0' },
            { chain: 'ripple', address: 'RLUSD rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' },
            { chain: 'stellar', address: 'USDY-GAJMPX5NBOG6TQFPQGRABJEEB2YE7RFRLUKJDZAZGAD5GFX4J7TADAZ6-1' },
          ],
        },
      }),
    );

    expect(errorsIn(problems).map((problem) => problem.error)).toEqual([
      'AddressFormatError',
      'AddressFormatError',
      'AddressFormatError',
    ]);
  });

  it('accepts an XRPL token as the sheet writes it: a code of any length, any of . : -, or a bare issuer', () => {
    const issuer = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
    const addresses = [`RLUSD.${issuer}`, `HAT:${issuer}`, `EURS-${issuer}`, `DIA-SD-COL1.${issuer}`, issuer, `524C555344000000000000000000000000000000.${issuer}`];
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'assets/xstocks/tslax.json': {
          ...tslax,
          deployments: [tslax.deployments[0], ...addresses.map((address) => ({ chain: 'ripple', address, deployedAt: '2025-01-01' }))],
        },
      }),
    );

    expect(problems.filter((problem) => problem.error === 'AddressFormatError')).toEqual([]);
  });
  it('accepts a Stellar classic asset as CODE-ISSUER, its code in either case, and a C contract, and fails a code before a contract', () => {
    const addresses = [
      'YLDS-GAC7MOPTQLQUM3KC24AW4GHS3RLF72LPEZO54AH7EZ6TSMGRB5SOAVH3',
      'gBENJI-GD5J73EKK5IYL5XS3FBTHHX7CZIYRP7QXDL57XFWGC2WVYWT326OBXRP',
      'CBGV2QFQBBGEQRUKUMCPO3SZOHDDYO6SCP5CH6TW7EALKVHCXTMWDDOF',
      'RSR-CDH2A7S4J6ECQDL4K4BB5JCBF37DYYYFNNKM2VIRZV3IVZ5VAT55BVFR',
    ];
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'assets/xstocks/tslax.json': {
          ...tslax,
          deployments: [tslax.deployments[0], ...addresses.map((address) => ({ chain: 'stellar', address, deployedAt: '2025-01-01' }))],
        },
      }),
    );

    expect(problems.map((problem) => [problem.error, problem.path])).toEqual([['AddressFormatError', 'deployments[4].address']]);
  });
});

describe('the taxonomy and the organization homes', () => {
  it('only warns on a flag override whose value is the derived one, since the override no longer says anything', () => {
    const stale = load({ ...baseTree(), 'assets/xstocks/tslax.json': withClass(tslax, { stablecoin: false, flagReason: 'kept' }) });
    const live = load({ ...baseTree(), 'assets/xstocks/tslax.json': withClass(tslax, { stablecoin: true, flagReason: 'kept' }) });

    expect(stale.problems).toEqual([
      expect.objectContaining({
        error: 'StaleFlagOverrideError',
        severity: 'warning',
        file: 'assets/xstocks/tslax.json',
        path: 'class.stablecoin',
      }),
    ]);
    expect(live.problems).toEqual([]);
  });

  it('fails a kind folder that is no organization kind, and a platform outside its asset folder', () => {
    const { problems } = load({
      ...baseTree(),
      'reference/organizations/oracles/chainlink.json': { identity: { slug: 'chainlink', name: 'Chainlink' } },
      'reference/organizations/platform/ondo.json': { identity: { slug: 'ondo', name: 'Ondo' } },
    });

    expect(errorsIn(problems).map((problem) => [problem.error, problem.file])).toEqual([
      ['OrganizationKindError', 'reference/organizations/oracles/chainlink.json'],
      ['FileNameError', 'reference/organizations/platform/ondo.json'],
    ]);
  });

  it("fails a platform block on a kind that holds none, and a venue whose organization is not its operator or a platform", () => {
    const { problems } = load({
      ...baseTree(),
      'reference/organizations/issuer/backed-assets-je-limited.json': {
        identity: { slug: 'backed-assets-je-limited', name: 'Backed Assets (JE) Limited' },
        platform: { primaryChain: 'ethereum' },
      },
      'perps/abc/venue.json': { ...xyzVenue(), slug: 'abc', organization: 'backed-assets-je-limited' },
    });

    expect(errorsIn(problems).map((problem) => [problem.error, problem.path])).toEqual([
      ['OrganizationKindError', 'platform.primaryChain'],
      ['OrganizationKindError', 'organization'],
    ]);
  });

  it('fails a venue operator that no venue names, and two primary deployments on one asset', () => {
    const [solana, ethereum] = tslax.deployments;
    const { problems } = load({
      ...baseTree(),
      'perps/abc/organization.json': { identity: { slug: 'abc-labs', name: 'ABC Labs' } },
      'assets/xstocks/tslax.json': { ...tslax, deployments: [solana, { ...ethereum, primary: true }] },
    });

    expect(errorsIn(problems).map((problem) => [problem.error, problem.file])).toEqual([
      ['PrimaryDeploymentError', 'assets/xstocks/tslax.json'],
      ['FileNameError', 'perps/abc/organization.json'],
    ]);
  });

  it("fails a published venue with no adapter, and passes an unpublished one and a HIP-3 dex read by its parent's", () => {
    const xyz = xyzVenue();
    const { problems } = load({
      ...baseTree(),
      'perps/flash/venue.json': { ...xyz, slug: 'flash', adapter: null },
      'perps/dark/venue.json': { ...xyz, slug: 'dark', adapter: null, published: false },
      'perps/cash/venue.json': { ...xyz, slug: 'cash', adapter: null, parent: 'xyz' },
    });

    expect(errorsIn(problems).map((problem) => [problem.error, problem.file])).toEqual([
      ['VenueAdapterError', 'perps/flash/venue.json'],
    ]);
  });

  it('asks no primary deployment of an asset with no known contract on a platform with no primary chain', () => {
    const { problems } = load({
      ...baseTree(),
      'assets/xstocks/platform.json': { identity: xstocksPlatform().identity },
      'assets/xstocks/tslax.json': tslaxWith({ deployments: [{ chain: 'base' }] }),
    });

    expect(errorsIn(problems)).toEqual([]);
  });

  it('only warns on a chain the sdk does not know and checks no address there, while a DefiLlama key the registry never saw is checked', () => {
    const head = registryOf({
      ...baseTree(),
      'assets/xstocks/tslax.json': {
        ...tslax,
        deployments: [
          ...tslax.deployments,
          { chain: 'zksync', address: 'cusd-wei', deployedAt: '2025-06-30' },
          { chain: 'xdai', address: 'cusd-wei', deployedAt: '2025-06-30' },
        ],
      },
    });

    expect(checkRegistry(head)).toEqual([
      expect.objectContaining({ error: 'UnknownChainError', severity: 'warning', path: 'deployments[2].chain' }),
      expect.objectContaining({ error: 'AddressFormatError', severity: 'error', path: 'deployments[3].address' }),
    ]);
  });
});
