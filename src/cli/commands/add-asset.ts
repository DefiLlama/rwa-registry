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
import { isEmpty, type Derive, type Field } from '../questionnaire';
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

// The terms, each asked yes or no, Enter taking what most assets in the registry hold (cex-listed: no, as only a yes is ever recorded).
const TERMS: Field[] = (
  [
    [
      'redeemable',
      'it can be redeemed with the issuer',
      'redeemable',
      'Can a holder redeem the token with the issuer?',
      true,
    ],
    [
      'cex-listed',
      'it trades on a centralized exchange',
      'on a centralized exchange',
      'Does the token trade on a centralized exchange?',
      false,
    ],
    [
      'kyc-for-mint-redeem',
      'minting or redeeming needs KYC',
      'KYC to mint or redeem',
      'Does minting or redeeming the token need KYC?',
      true,
    ],
    [
      'kyc-to-transfer-hold',
      'holding or transferring needs KYC',
      'KYC to hold or transfer',
      'Does holding or transferring the token need KYC?',
      true,
    ],
    [
      'transferable',
      'it can move between wallets',
      'moves between wallets',
      'Can the token move between wallets?',
      true,
    ],
    [
      'self-custody',
      'a holder can keep it in their own wallet',
      'self-custody',
      'Can a holder keep the token in their own wallet?',
      true,
    ],
    ['yield-bearing', 'it pays a yield', 'pays a yield', 'Does the token pay a yield?', false],
  ] as const
).map(([flag, description, label, question, fallback]) => ({
  flag: `--${flag} <bool>`,
  description: `${description}: true or false`,
  label,
  question,
  default: fallback,
}));

// An override is asked only as a yes or no that forces the published flag; Enter leaves the derived one.
const override = (flag: string, name: string): Field => ({
  flag: `--${flag}-override <bool>`,
  description: `the published ${name} flag where the derived one is wrong: true or false`,
  label: `${name} flag override`,
  question: `Override the ${name} flag?`,
  hint: 'Enter to leave it derived; yes or no to force it',
});

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
        label: 'platform',
        question: 'Which platform is the token part of?',
        required: true,
        choices: platformChoices,
      },
      {
        flag: '--underlying <slug>',
        description: 'the underlying it tracks, tesla-inc',
        label: 'underlying',
        question: 'Which real-world asset does the token track?',
        required: true,
        choices: underlyingChoices,
      },
      {
        flag: '--symbol <text>',
        description: 'the token symbol, TSLAx',
        label: 'token symbol',
        question: 'What is the token symbol?',
        example: 'TSLAx',
        required: true,
      },
      {
        flag: '--name <text>',
        description: 'the token name, Tesla xStock',
        label: 'token name',
        question: 'What is the token name?',
        example: 'Tesla xStock',
        required: true,
      },
      {
        flag: '--deployment <items...>',
        description: `one <chain>:<address>[:<YYYY-MM-DD>|:${UNDATED}] per deployment; a missing date is asked of the chain`,
        label: 'deployments',
        required: true,
        list: true,
        row: 'deployments',
        legs: {
          fields: [
            {
              key: 'chain',
              description: 'the chain, as the sdk names it',
              question: 'Which chain is the token deployed on?',
              example: 'ethereum',
              required: true,
              open: true,
              choices: chainChoices,
            },
            {
              key: 'address',
              description: 'the contract or mint address',
              question: 'What is the token address on that chain?',
              example: '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0',
              required: true,
            },
            {
              key: 'deployedAt',
              description: 'the day it was deployed, YYYY-MM-DD, or unknown',
              question: 'On which day was the token contract deployed?',
              example: '2025-06-30, or unknown',
              date: true,
              derive: deployedAtOf(deps),
            },
          ],
          item: (leg) => [leg.chain, leg.address, leg.deployedAt ?? UNDATED].join(':'),
          more: 'Add another deployment?',
        },
      },
      {
        flag: '--category <slugs...>',
        description: 'the categories it is shelved under, first the main one: stocks-equities',
        label: 'categories',
        question: 'Which categories is the token listed under on the site?',
        required: true,
        list: true,
        choices: vocabularyChoices('category'),
      },
      {
        flag: '--type <slug>',
        description: 'the type',
        label: 'type',
        question: 'Is the token an asset itself or a wrapper of another token?',
        required: true,
        choices: vocabularyChoices('type'),
      },
      {
        flag: '--structure <slug>',
        description: 'how the exposure is wrapped, an asset class: stock-backed',
        label: 'asset class',
        question: 'Which asset class is the token, by how it holds its exposure?',
        required: true,
        choices: vocabularyChoices('asset-class'),
      },
      {
        flag: '--rwa-classification <slug>',
        description: 'the RWA classification',
        label: 'RWA classification',
        question: 'Which RWA classification does the token fall under?',
        required: true,
        choices: vocabularyChoices('rwa-classification'),
      },
      ...TERMS,
      {
        flag: '--attestation-frequency <text>',
        description: 'how often its backing is attested, monthly',
        label: 'attestation frequency',
        question: 'How often is the backing attested?',
        example: 'monthly',
      },
      override('stablecoin', 'stablecoin'),
      override('governance', 'governance'),
      {
        flag: '--flag-reason <text>',
        description: 'why a flag is overridden',
        label: 'override reason',
        question: 'Why is the flag overridden?',
        example: 'the issuer redeems it 1:1 for US dollars',
        asked: (values) => values.stablecoinOverride !== undefined || values.governanceOverride !== undefined,
      },
      {
        flag: '--issuer <slug>',
        description: 'the organization that issues it, backed-assets-je-limited',
        label: 'issuer',
        question: 'Which organization issues the token?',
        required: true,
        choices: organizationChoices,
        row: ROLE,
      },
      {
        flag: '--issuer-source <url>',
        description: 'the page that names the issuer',
        label: 'issuer source',
        question: 'Which page names the issuer?',
        example: 'https://assets.backed.fi/legal-documentation',
        row: ROLE,
      },
      {
        flag: '--tokenizer <slug>',
        description: 'the organization that tokenized it for the issuer',
        label: 'tokenizer',
        question: 'Which organization tokenized it for the issuer?',
        choices: organizationChoices,
        row: ROLE,
      },
      {
        flag: '--oracle <slug>',
        description: 'the organization that prices it, chainlink',
        label: 'oracle',
        question: 'Which organization provides its price feed?',
        choices: organizationChoices,
        row: ROLE,
      },
      {
        flag: '--auditor <slug>',
        description: 'the organization that attests its backing, the-network-firm',
        label: 'auditor',
        question: 'Which organization attests its backing?',
        choices: organizationChoices,
        row: ROLE,
      },
      {
        flag: '--coingecko-id <id>',
        description: 'the CoinGecko id, when it has one',
        label: 'CoinGecko id',
        question: 'What is its CoinGecko id?',
        example: 'tesla-xstock',
      },
      {
        flag: '--canonical-market-id <text>',
        description: 'the canonical market id, the symbol by default',
        label: 'canonical market id',
        question: 'Which market id names the asset and its file?',
        derive: (values) => (values.symbol === undefined ? undefined : { value: values.symbol, why: 'the symbol' }),
      },
      {
        flag: '--primary-chain <slug>',
        description: "the chain whose deployment is primary, the first deployment's chain by default",
        label: 'primary chain',
        question: 'Which chain holds the primary deployment?',
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
