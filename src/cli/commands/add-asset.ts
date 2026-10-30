/**
 * add asset: one asset file under assets/<platform>/ with its legacy id, its dated deployments and its issuer role.
 * @dev review: src/cli/addCommand.ts, src/discover/discoverReads.ts
 */
import type { Env } from '../../discover/discoverConfig';
import { whyOf } from '../../discover/dateResult';
import { discoverReads, type DiscoverReads } from '../../discover/discoverReads';
import { FlagFormatError, MissingFieldError, NoSuchRowError } from '../../errors/cli';
import { familyOf, homeFile, nextAssetKeys } from '../../registry';
import type { Registry } from '../../schema';
import { defineAddCommand, fileContent, organizationChoices, vocabularyChoices, type FlagValues } from '../addCommand';
import type { WriteContext } from '../writeCommand';

const FILE = 'add asset';

type Deployment = Record<string, unknown> & { chain: string; address?: string | null; deployedAt?: string | null };

const deploymentOf = (item: string): Deployment => {
  const match = /^([^:]+):(.+?)(?::(\d{4}-\d{2}-\d{2}))?$/.exec(item);
  if (!match)
    throw new FlagFormatError({ file: FILE, message: `--deployment ${item} is not <chain>:<address>[:<YYYY-MM-DD>]` });
  const [, chain, address, deployedAt] = match;
  return { chain: chain!, address: address!, deployedAt: deployedAt ?? null };
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

// A deployment given without its date is dated from the chain, and refused when the chain does not say; with no reads it stays undated, noted once, and validate warns until the date is set.
const dated = async (deployments: Deployment[], reads: DiscoverReads | null, note: WriteContext['note']) => {
  const undated = undatedContracts(deployments);
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

// The roles in their written order: the issuer and its tokenizer first, then the oracle and the auditor.
const rolesOf = (values: FlagValues): Role[] => {
  const source = values.issuerSource === undefined ? {} : { sourceLinks: [String(values.issuerSource)] };
  const others = (['tokenizer', 'oracle', 'auditor'] as const).flatMap((kind) =>
    values[kind] === undefined ? [] : [{ organization: String(values[kind]), kind }],
  );
  return [{ organization: String(values.issuer), kind: 'issuer', ...source }, ...others];
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

export const createAddAssetCommand = (
  deps: { env?: Env; reads?: (log: (line: string) => void) => DiscoverReads } = {},
) =>
  defineAddCommand({
    name: 'add asset',
    description: 'add one asset file with its deployments and the next legacy id',
    template: 'asset',
    fields: [
      { flag: '--platform <slug>', description: 'the platform folder under assets/', required: true },
      { flag: '--symbol <text>', description: 'the token symbol, TSLAx', required: true },
      { flag: '--name <text>', description: 'the token name, Tesla xStock', required: true },
      { flag: '--underlying <slug>', description: 'the underlying it tracks, tesla-inc', required: true },
      {
        flag: '--deployment <items...>',
        description: 'one <chain>:<address>[:<YYYY-MM-DD>] per deployment; a missing date is asked of the chain',
        required: true,
        list: true,
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
      {
        flag: '--category <slugs...>',
        description: 'the categories it is shelved under, first the main one: stocks-equities',
        required: true,
        list: true,
        choices: vocabularyChoices('category'),
      },
      {
        flag: '--issuer <slug>',
        description: 'the organization that issues it, backed-assets-je-limited',
        required: true,
        choices: organizationChoices,
      },
      { flag: '--issuer-source <url>', description: 'the page that names the issuer' },
      { flag: '--tokenizer <slug>', description: 'the organization that tokenized it for the issuer' },
      { flag: '--oracle <slug>', description: 'the organization that prices it, chainlink' },
      { flag: '--auditor <slug>', description: 'the organization that attests its backing, the-network-firm' },
      { flag: '--canonical-market-id <text>', description: 'the canonical market id, the symbol by default' },
      {
        flag: '--primary-chain <slug>',
        description: "the chain whose deployment is primary, the first deployment's chain by default",
      },
      { flag: '--coingecko-id <id>', description: 'the CoinGecko id, when it has one' },
      {
        flag: '--no-discover',
        description:
          'never ask the chain for a missing deployment date; a deployment given without one stays undated, and validate warns until it is set',
      },
    ],
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
      primaryChain: values.primaryChain,
      coingeckoId: values.coingeckoId,
      deployments: (values.deployment as string[]).map(deploymentOf),
      roles: rolesOf(values),
    }),
    files: async ({ platform, primaryChain, ...row }, registry, { note, flags }) => {
      const roles = checkedRoles((row.roles ?? []) as Role[], registry);
      const canonicalMarketId = String(row.canonicalMarketId ?? row.symbol);
      const { legacyId, slug } = nextAssetKeys(registry, canonicalMarketId, {
        legacyId: row.legacyId as number | null | undefined,
        slug: row.slug as string | null | undefined,
      });
      const given = ((row.deployments ?? []) as Deployment[]).map(inKeyForm);
      const reads =
        flags.discover === false ? null : (deps.reads ?? ((log) => discoverReads(deps.env ?? process.env, log)))(note);
      const deployments = primaryOf(await dated(given, reads, note), primaryChain);
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
