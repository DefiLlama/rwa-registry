/**
 * add asset: one asset file under assets/<platform>/ with its legacy id, its dated deployments and its issuer role.
 * @dev review: src/cli/addCommand.ts, src/discover/discoverReads.ts
 */
import type { Env } from '../../discover/discoverConfig';
import { whyOf } from '../../discover/dateResult';
import { discoverReads, type DiscoverReads } from '../../discover/discoverReads';
import { FlagFormatError, MissingFieldError, NoSuchRowError } from '../../errors/cli';
import { familyOf, homeFile, nextAssetKeys } from '../../registry';
import { fieldPath, type Registry } from '../../schema';
import { defineAddCommand, fileContent, organizationChoices, vocabularyChoices, type FlagValues } from '../addCommand';
import { commaList } from '../commaList';
import { parseFieldValue } from '../fieldValue';
import { isEmpty, type Derive } from '../questionnaire';
import { optionKey, type WriteContext } from '../writeCommand';

const FILE = 'add asset';

type Deployment = Record<string, unknown> & { chain: string; address?: string | null; deployedAt?: string | null };

// The day "unknown" is a deployment left undated on purpose, which discover is not asked about.
const UNDATED = 'unknown';

const deploymentOf = (item: string): Deployment => {
  const match = /^([^:]+):(.+?)(?::(\d{4}-\d{2}-\d{2}|unknown))?$/.exec(item);
  if (!match) {
    const message = `--deployment ${item} is not <chain>:<address>[:<YYYY-MM-DD>|:${UNDATED}]`;
    throw new FlagFormatError({ file: FILE, message });
  }
  const [, chain, address, deployedAt] = match;
  return { chain: chain!, address: address!, deployedAt: deployedAt === UNDATED ? null : (deployedAt ?? null) };
};

const inKeyForm = (deployment: Deployment): Deployment => {
  const evm = familyOf(deployment.chain) === 'evm';
  return evm && typeof deployment.address === 'string'
    ? { ...deployment, address: deployment.address.toLowerCase() }
    : deployment;
};

const named = (deployment: Deployment) => `${deployment.chain}:${deployment.address}`;

// Only --from can give a deployment with no address; a chain with no known contract has no date to ask.
const undatedContracts = (deployments: Deployment[]) =>
  deployments.filter(
    (deployment): deployment is Deployment & { address: string } =>
      deployment.address != null && !deployment.deployedAt,
  );

// A deployment given without its date is dated from the chain, and refused when the chain does not say; with no reads, or given as unknown, it stays undated, noted once, and validate warns until the date is set.
const dated = async (
  deployments: Deployment[],
  reads: DiscoverReads | null,
  note: WriteContext['note'],
  undatedOnPurpose: Set<string>,
) => {
  const kept = undatedContracts(deployments).filter((deployment) => undatedOnPurpose.has(named(deployment)));
  if (kept.length) {
    const names = kept.map(named).join(', ');
    note(`${names}: left undated as given; validate warns undated-deployment until deployedAt is set`);
  }
  const undated = undatedContracts(deployments).filter((deployment) => !undatedOnPurpose.has(named(deployment)));
  if (!undated.length) return deployments;
  if (!reads) {
    const names = undated.map(named).join(', ');
    note(`${names}: left undated under --no-discover; validate warns undated-deployment until deployedAt is set`);
    return deployments;
  }
  const queries = undated.map(({ chain, address }) => ({ chain, address }));
  const results = await reads.dates(queries);
  const byDeployment = new Map<Deployment, (typeof results)[number]>(
    undated.map((deployment, index) => [deployment, results[index]!]),
  );
  return deployments.map((deployment) => {
    const result = byDeployment.get(deployment);
    if (!result) return deployment;
    if (result.date === null) {
      const message = `${named(deployment)}: no deployment date (${whyOf(result)}); pass :<YYYY-MM-DD>`;
      throw new FlagFormatError({ file: FILE, message });
    }
    note(`${named(deployment)}: deployedAt ${result.date} from ${result.source} (${result.basis})`);
    return { ...deployment, deployedAt: result.date };
  });
};

// One deployment is primary: the template's, else the one on --primary-chain, else the first.
const primaryOf = (deployments: Deployment[], chain: unknown): Deployment[] => {
  if (deployments.some((deployment) => deployment.primary === true)) return deployments;
  const index = chain === undefined ? 0 : deployments.findIndex((deployment) => deployment.chain === chain);
  if (index === -1) throw new FlagFormatError({ file: FILE, message: `--primary-chain ${chain}: no deployment on it` });
  return deployments.map((deployment, i) => (i === index ? { ...deployment, primary: true } : deployment));
};

type Role = { organization: string; kind: string; sourceLinks?: string[] };

// The roles in their written order: the issuer and its tokenizer first, then the oracle and the auditor; none when no role is given, so a template's roles stay.
const rolesOf = (values: FlagValues): Role[] | undefined => {
  const source = values.issuerSource === undefined ? {} : { sourceLinks: [String(values.issuerSource)] };
  const roles = (['issuer', 'tokenizer', 'oracle', 'auditor'] as const).flatMap((kind) =>
    values[kind] === undefined
      ? []
      : [{ organization: String(values[kind]), kind, ...(kind === 'issuer' ? source : {}) }],
  );
  return roles.length ? roles : undefined;
};

// The published issuer string is made from the issuer role, and a role names an organization the registry holds.
const checkedRoles = (roles: Role[], registry: Registry) => {
  if (!roles.some(({ kind }) => kind === 'issuer')) {
    const message = 'an asset needs an issuer role; pass --issuer or add one to roles';
    throw new MissingFieldError({ file: FILE, message });
  }
  const known = new Set(registry.organization.map((row) => row.slug));
  const unknown = roles.find(({ organization }) => !known.has(organization));
  if (unknown) {
    const message = `${unknown.kind} ${unknown.organization} is not an organization; add it first with add organization`;
    throw new NoSuchRowError({ file: FILE, message });
  }
  return roles;
};

type Deps = { env?: Env; reads?: (log: (line: string) => void) => DiscoverReads };

// One reads per run, shared by the day a question offers and the files, so its deps are built once.
const readsOf = (deps: Deps, context: WriteContext): DiscoverReads => {
  const reads = context.memo.get('reads') as DiscoverReads | undefined;
  if (reads) return reads;
  const made = (deps.reads ?? ((log) => discoverReads(deps.env ?? process.env, log)))(context.note);
  context.memo.set('reads', made);
  return made;
};

// The day discover gives the leg's contract, offered as the answer; why it gives none is shown instead.
const deployedAtOf =
  (deps: Deps): Derive =>
  async (leg, context) => {
    if (context.flags.discover === false || isEmpty(leg.chain) || isEmpty(leg.address)) return undefined;
    const query = inKeyForm({ chain: String(leg.chain), address: String(leg.address) });
    const [result] = await readsOf(deps, context).dates([{ chain: query.chain, address: query.address! }]);
    if (!result) return undefined;
    if (result.date === null) return { why: `discover has none: ${whyOf(result)}; type it, or leave it empty` };
    return { value: result.date, why: `${result.date} from ${result.source}, ${result.basis}` };
  };

const platformChoices = (registry: Registry) =>
  registry.organization
    .filter((row) => row.kind === 'platform')
    .map((row) => ({ value: row.slug, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

const underlyingChoices = (registry: Registry) =>
  registry.underlying.map((row) => ({ value: row.slug, name: row.name })).sort((a, b) => a.name.localeCompare(b.name));

const chainChoices = (registry: Registry) => [...new Set(registry.deployment.map((row) => row.chain))].sort();

const chainsOf = (values: FlagValues) => commaList(values.deployment).map((item) => item.split(':')[0]!);

const FLAG_CHOICES = () => ['true', 'false'];

// The terms, each asked true or false, or skipped.
const TERMS = [
  ['redeemable', 'it can be redeemed with the issuer'],
  ['cex-listed', 'it trades on a centralized exchange'],
  ['kyc-for-mint-redeem', 'minting or redeeming needs KYC'],
  ['kyc-to-transfer-hold', 'holding or transferring needs KYC'],
  ['transferable', 'it can move between wallets'],
  ['self-custody', 'a holder can keep it in their own wallet'],
  ['yield-bearing', 'it pays a yield'],
].map(([flag, description]) => ({
  flag: `--${flag} <bool>`,
  description: `${description}: true or false`,
  choices: FLAG_CHOICES,
}));

const termsOf = (values: FlagValues) =>
  Object.fromEntries(
    [...TERMS.map(({ flag }) => optionKey(flag)), 'stablecoinOverride', 'governanceOverride'].map((key) => [
      key,
      values[key] === undefined ? undefined : parseFieldValue('asset', fieldPath('asset', key), String(values[key])),
    ]),
  );

const ROLE = 'roles';

export const createAddAssetCommand = (deps: Deps = {}) =>
  defineAddCommand({
    name: 'add asset',
    description: 'add one asset file with its deployments and the next legacy id',
    template: 'asset',
    fields: [
      {
        flag: '--platform <slug>',
        description: 'the platform folder under assets/',
        required: true,
        choices: platformChoices,
      },
      {
        flag: '--underlying <slug>',
        description: 'the underlying it tracks, tesla-inc',
        required: true,
        choices: underlyingChoices,
      },
      { flag: '--symbol <text>', description: 'the token symbol, TSLAx', required: true },
      { flag: '--name <text>', description: 'the token name, Tesla xStock', required: true },
      {
        flag: '--deployment <items...>',
        description: `one <chain>:<address>[:<YYYY-MM-DD>|:${UNDATED}] per deployment; a missing date is asked of the chain`,
        required: true,
        list: true,
        row: 'deployments',
        legs: {
          fields: [
            {
              key: 'chain',
              description: 'the chain, as the sdk names it',
              required: true,
              open: true,
              choices: chainChoices,
            },
            { key: 'address', description: 'the contract or mint address', required: true },
            {
              key: 'deployedAt',
              description: 'the day it was deployed, YYYY-MM-DD, or unknown',
              date: true,
              derive: deployedAtOf(deps),
            },
          ],
          item: (leg) => [leg.chain, leg.address, leg.deployedAt ?? UNDATED].join(':'),
          more: 'another deployment?',
        },
      },
      {
        flag: '--category <slugs...>',
        description: 'the categories it is shelved under, first the main one: stocks-equities',
        required: true,
        list: true,
        choices: vocabularyChoices('category'),
      },
      { flag: '--type <slug>', description: 'the type', required: true, choices: vocabularyChoices('type') },
      {
        flag: '--structure <slug>',
        description: 'how the exposure is wrapped, an asset class: stock-backed',
        required: true,
        choices: vocabularyChoices('asset-class'),
      },
      {
        flag: '--rwa-classification <slug>',
        description: 'the RWA classification',
        required: true,
        choices: vocabularyChoices('rwa-classification'),
      },
      ...TERMS,
      { flag: '--attestation-frequency <text>', description: 'how often its backing is attested, monthly' },
      {
        flag: '--stablecoin-override <bool>',
        description: 'the published stablecoin flag where the derived one is wrong: true or false',
        choices: FLAG_CHOICES,
      },
      {
        flag: '--governance-override <bool>',
        description: 'the published governance flag where the derived one is wrong: true or false',
        choices: FLAG_CHOICES,
      },
      { flag: '--flag-reason <text>', description: 'why a flag is overridden' },
      {
        flag: '--issuer <slug>',
        description: 'the organization that issues it, backed-assets-je-limited',
        required: true,
        choices: organizationChoices,
        row: ROLE,
      },
      { flag: '--issuer-source <url>', description: 'the page that names the issuer', row: ROLE },
      {
        flag: '--tokenizer <slug>',
        description: 'the organization that tokenized it for the issuer',
        choices: organizationChoices,
        row: ROLE,
      },
      {
        flag: '--oracle <slug>',
        description: 'the organization that prices it, chainlink',
        choices: organizationChoices,
        row: ROLE,
      },
      {
        flag: '--auditor <slug>',
        description: 'the organization that attests its backing, the-network-firm',
        choices: organizationChoices,
        row: ROLE,
      },
      { flag: '--coingecko-id <id>', description: 'the CoinGecko id, when it has one' },
      {
        flag: '--canonical-market-id <text>',
        description: 'the canonical market id, the symbol by default',
        derive: (values) => (values.symbol === undefined ? undefined : { value: values.symbol }),
      },
      {
        flag: '--primary-chain <slug>',
        description: "the chain whose deployment is primary, the first deployment's chain by default",
        row: 'deployments',
        choices: (registry) => chainChoices(registry),
        derive: (values) => {
          const [first] = chainsOf(values);
          return first === undefined ? undefined : { value: first };
        },
        asked: (values) => chainsOf(values).length > 1,
      },
      {
        flag: '--no-discover',
        description:
          'never ask the chain for a missing deployment date; a deployment given without one stays undated, and validate warns until it is set',
      },
    ],
    assigned: (['slug', 'legacyId'] as const).map((key) => ({
      name: key === 'slug' ? 'slug' : 'legacy id',
      derive: (values, { registry }) => {
        const id = values.canonicalMarketId ?? values.symbol;
        return id === undefined ? undefined : nextAssetKeys(registry, String(id))[key];
      },
    })),
    fromFlags: (values) => ({
      platform: values.platform,
      canonicalMarketId: values.canonicalMarketId,
      symbol: values.symbol,
      name: values.name,
      underlying: values.underlying,
      structure: values.structure,
      type: values.type,
      rwaClassification: values.rwaClassification,
      category: values.category,
      ...termsOf(values),
      attestationFrequency: values.attestationFrequency,
      flagReason: values.flagReason,
      primaryChain: values.primaryChain,
      coingeckoId: values.coingeckoId,
      deployments: values.deployment === undefined ? undefined : commaList(values.deployment).map(deploymentOf),
      roles: rolesOf(values),
    }),
    files: async ({ platform, primaryChain, ...row }, registry, context) => {
      const { note, flags } = context;
      const roles = checkedRoles((row.roles ?? []) as Role[], registry);
      const canonicalMarketId = String(row.canonicalMarketId ?? row.symbol);
      const { legacyId, slug } = nextAssetKeys(registry, canonicalMarketId, {
        legacyId: row.legacyId as number | null | undefined,
        slug: row.slug as string | null | undefined,
      });
      const given = ((row.deployments ?? []) as Deployment[]).map(inKeyForm);
      const reads = flags.discover === false ? null : readsOf(deps, context);
      const undatedOnPurpose = new Set(
        commaList(flags.deployment)
          .filter((item) => item.endsWith(`:${UNDATED}`))
          .map((item) => named(inKeyForm(deploymentOf(item)))),
      );
      const deployments = primaryOf(await dated(given, reads, note, undatedOnPurpose), primaryChain);
      const content = fileContent('asset', {
        ...row,
        slug,
        legacyId,
        canonicalMarketId,
        activeAumReviewed: row.activeAumReviewed ?? false,
        deployments,
        roles,
      });
      return [{ path: homeFile('asset', { platform, slug }), content }];
    },
  });

export const addAsset = createAddAssetCommand();
