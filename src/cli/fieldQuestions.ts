/**
 * FIELD_QUESTIONS: the question each schema field is asked with, by its path: the label the confirmation shows, the sentence, what it asks for where the sentence does not say, an example from a registry file, and the answer type where the schema's own type says less.
 * @dev review: src/cli/schemaFields.ts, then src/cli/answers/
 */
import type { TableName } from '../schema';
import { many, type AnswerType } from './answers/answerType';
import { period } from './answers/days';
import { poolId } from './answers/ids';
import { linkOn } from './answers/links';
import { share, year } from './answers/numbers';
import { oneOf } from './answers/picks';
import { slug, suggested } from './answers/text';
import { commaList } from './commaList';
import type { Field, FlagValues, Legs } from './questionnaire';

// A field's wording and answer; the schema gives the generated question its flag, row and path.
export type FieldQuestion = Omit<Partial<Field>, 'answer' | 'label' | 'question'> & {
  label: string;
  question: string;
  // Built for the table and path it is asked on, as the values a suggested text offers.
  answer?: AnswerType | ((table: TableName, path: string[]) => AnswerType);
  // The field this question hangs on: it is asked right after it, from its answer.
  follows?: string;
};

// A pick among the items an earlier answer gave, taken without asking when there is only one, as the primary chain.
export const pickedFrom = (itemsOf: (values: Record<string, unknown>) => string[]) => ({
  answer: oneOf(({ values }) => itemsOf(values)),
  asked: (values: FlagValues) => itemsOf(values).length > 1,
  derive: (values: FlagValues) => {
    const [first] = itemsOf(values);
    return first === undefined ? undefined : { value: first };
  },
});

// The milestones' text as the registry holds it: "<when>: <what happened>" items joined by " | ".
const MILESTONES: Legs = {
  fields: [
    {
      key: 'when',
      description: 'when it happened',
      question: 'When did the milestone happen?',
      explain: 'Its history one milestone at a time, the latest first; Enter on an empty answer ends the list.',
      example: '2025-08',
      answer: period,
    },
    {
      key: 'what',
      description: 'what happened',
      question: 'What happened then?',
      example: 'Dinari Financial Network omni chain orderbook L1 launched on Avalanche (assets/dinari)',
      required: true,
    },
  ],
  item: (leg) => `${String(leg.when)}: ${String(leg.what)}`,
  split: (item) => {
    const match = /^([^:]+):\s*(.+)$/.exec(item);
    return match ? { when: match[1], what: match[2] } : null;
  },
  shape: '<when>: <what happened>',
  join: (items) => items.join(' | '),
  more: 'Add another milestone?',
};

// The vocabularies whose values imply a stablecoin or a governance token, the ones derivedFlagsOf reads.
const FLAG_VOCABULARIES = ['category', 'asset-class', 'rwa-classification'];

export const FIELD_QUESTIONS: Record<string, FieldQuestion> = {
  wraps: { label: 'wrapped token', question: 'Which token in the registry does it wrap, when it wraps one?' },
  protocolIds: {
    label: 'DefiLlama protocol ids',
    question: 'Which DefiLlama protocol ids does it map to?',
    explain: 'The ids of the DefiLlama protocol pages that track it; a parent protocol is written parent#<slug>.',
    example: '2525, parent#ondo-finance',
  },
  yieldPoolIds: {
    label: 'yield pool ids',
    question: 'Which DefiLlama yield pools may give its native yield?',
    example: '747c1d2a-c668-4682-b9f9-296708a3dd90',
    answer: many(poolId),
  },
  identifiers: {
    label: 'identifiers',
    question: 'Which ISIN, FIGI or LEI identifies it?',
    explain: 'Each as its scheme and value; the check digit of an ISIN or an LEI is verified.',
    example: 'isin:US88160R1014',
  },
  documents: {
    label: 'documents',
    question: 'Which documents does the issuer publish for it?',
    example: 'https://ipfs.io/ipfs/Qmb6JGcvZQ8ZPEa2Ca8LguBuvnYhGwS2JBFQRK2TKixTc9',
  },
  description: {
    label: 'description',
    question: 'How would you describe it in a sentence or two?',
    explain: 'What it does, in plain words, for the page that shows it.',
    example:
      'Lofty enables fractional ownership and trading of real estate assets through tokenization. (assets/lofty)',
  },
  logo: {
    label: 'logo',
    question: 'Which link holds its logo?',
    example: 'https://icons.llamao.fi/icons/protocols/xstocks',
  },
  'links.website': { label: 'website', question: 'Which pages are its website?', example: 'https://xstocks.com/' },
  'links.twitter': {
    label: 'Twitter',
    question: 'Which Twitter account does it post from?',
    example: 'https://x.com/xStocksFi',
    answer: linkOn('x.com', 'twitter.com'),
  },
  'links.docs': { label: 'docs', question: 'Where are its docs?', example: 'https://docs.xstocks.com/' },
  'links.linkedin': {
    label: 'LinkedIn',
    question: 'Which LinkedIn page does it have?',
    example: 'https://www.linkedin.com/company/backedfi',
    answer: linkOn('linkedin.com'),
  },
  'links.discord': {
    label: 'Discord',
    question: 'Which Discord server does it run?',
    example: 'https://discord.com/invite/xstocksfi',
    answer: linkOn('discord.gg', 'discord.com', 'discord.me', 'dsc.gg'),
  },
  'links.telegram': {
    label: 'Telegram',
    question: 'Which Telegram group does it run?',
    example: 'https://t.me/xstocks',
    answer: linkOn('t.me'),
  },
  'links.github': {
    label: 'GitHub',
    question: 'Which GitHub organization holds its code?',
    example: 'https://github.com/backed-fi',
    answer: linkOn('github.com'),
  },
  'links.refLinks': {
    label: 'reference links',
    question: 'Which other pages describe it?',
    explain: 'Pages beyond its own site and socials, such as a referral page or a news article.',
    example: 'https://defi.xstocks.fi/points?ref=8QG15V04',
  },
  parent: {
    label: 'parent organization',
    question: 'Which organization does it belong to?',
    explain:
      'The group it is part of, as Aave RWA Market (Horizon) belongs to Aave; leave it empty when it stands alone.',
  },
  protocolSlug: {
    label: 'DefiLlama protocol slug',
    question: 'Which DefiLlama protocol slug does it have?',
    explain: 'The last part of its page on defillama.com/protocol/, when it has one.',
    example: 'xstocks',
    answer: slug,
  },
  registryInfo: {
    label: 'company registry entry',
    question: 'Which company registry entry names it?',
    explain:
      'The legal entity as a company registry or an official filing names it, with the number when it is public.',
    example: 'Hastra Technologies Inc. (assets/hastra)',
  },
  foundedYear: { label: 'founding year', question: 'In which year was it founded?', example: '2021', answer: year },
  headquarters: {
    label: 'headquarters',
    question: 'Where are its headquarters?',
    explain: 'The city and the country.',
    example: 'Zug, Switzerland',
  },
  founders: {
    label: 'founders',
    question: 'Who founded it?',
    explain: 'The founders and the people who run it, each with their role in brackets, comma-separated.',
    example:
      'Bhaji Illuminati (CEO since February 2025), Lucas Vogelsang (Co-Founder, board), Martin Quensel (Co-Founder, President) (assets/centrifuge)',
  },
  regulatoryStatus: {
    label: 'regulatory status',
    question: 'How is it regulated?',
    explain:
      'The licences, registrations or exemptions it operates under, who grants them and since when; say so when none are disclosed.',
    example:
      'Issuer Old Vector LLC is registered in Kyrgyzstan with a virtual asset issuer registration from February 2025 (assets/a7a5)',
  },
  keyMilestones: { label: 'key milestones', question: 'Which milestones mark its history?', legs: MILESTONES },
  entityStructureNotes: {
    label: 'entity structure',
    question: 'How is its legal entity structured?',
    explain: 'Each legal entity behind it, where it is incorporated, and what it does: issues, holds or runs.',
    example:
      '0xequity Corp, Road Town, Tortola, British Virgin Islands; 0xequity US, Inc., Wilmington, Delaware (assets/0xequity)',
  },
  category: {
    label: 'categories',
    question: 'Which categories does it list its assets under?',
    explain: 'The platform page shows these as its tags; pick each category its assets fall under.',
  },
  platformType: {
    label: 'asset classes',
    question: 'Which asset classes does it issue?',
    explain: 'The platform page shows these as its tags too; pick each class of token it issues.',
  },
  accessModel: { label: 'access model', question: 'Who can buy its assets?' },
  chains: {
    label: 'chains',
    question: 'Which chains does it issue on?',
    explain: 'Pick each chain its tokens are deployed on; type to filter the list.',
  },
  primaryChain: {
    label: 'primary chain',
    question: 'Which of those chains does it mainly issue on?',
    follows: 'chains',
    ...pickedFrom((values) => commaList(values.chains)),
  },
  attestationFrequency: {
    label: 'attestation frequency',
    question: 'How often is its backing attested?',
    example: 'Monthly',
    answer: suggested,
  },
  // A maintainer's mark that nothing reads; it is set by editing the file, never asked when a row is added.
  onchainMcapBasis: {
    label: 'onchain mcap basis',
    question: 'Which supply does its onchain market cap count?',
    asked: () => false,
  },
  fees: {
    label: 'fee terms',
    question: 'Fill in its fee terms now?',
    explain:
      'Twenty-six questions on how it earns: its fees, the documents that state them, and notes; a fee in basis points is written as 25 for 0.25 percent.',
  },
  'fees.floatIncome': {
    label: 'float income',
    question: 'Does it earn interest on the reserves behind its tokens?',
  },
  'fees.revenueConfidence': {
    label: 'revenue confidence',
    question: 'How sure are its revenue figures?',
  },
  'fees.feeLastVerified': {
    label: 'fee terms last verified',
    question: 'On which day were its fee terms last verified?',
    example: '2026-05-11',
  },
  'fees.feeWaiverEndDate': {
    label: 'fee waiver end',
    question: 'On which day does its fee waiver end, when one applies?',
    example: '2026-07-31',
  },
  'fees.revenueModel': {
    label: 'revenue model',
    question: 'How does it earn its revenue?',
    example: 'Management Fee',
    answer: suggested,
  },
  'fees.revenueNotes': {
    label: 'revenue notes',
    question: 'What should a reader know about its revenue figures?',
    example:
      'No fee schedule disclosed. Site was unreachable at verification time and details were drawn from an archived snapshot. (assets/ouroboros)',
  },
  'fees.revenueVerificationMethod': {
    label: 'revenue verification method',
    question: 'How were its fee terms verified?',
    explain: 'The pages, documents or chain reads the fee terms come from.',
    example:
      'docs.goblin.fi full index incl. Key Concepts, GoVault, RWA Vault and Audit pages; no fee schedule or legal terms published (assets/goblin)',
  },
  'fees.chainShareClassFeeVariants': {
    label: 'fee variants',
    question: 'Do its fees differ by chain or share class?',
    example: 'BUIDL: 50 bps (Ethereum/Arbitrum/Optimism), 20 bps (Aptos/Avalanche/Polygon/Solana) (assets/securitize)',
  },
  'fees.subsidyRebateArrangements': {
    label: 'subsidies and rebates',
    question: 'Which fee waivers, subsidies or rebates apply?',
    example: 'OUSG mgmt fee waived to 2026-07-01 (assets/ondo)',
  },
  'fees.takeRateBasis': {
    label: 'take rate basis',
    question: 'What is its take rate charged on?',
    example: 'Float income on reserves (assets/tether)',
  },
  'fees.revenueMix': {
    label: 'revenue mix',
    question: 'Which sources does its revenue come from, and in what share?',
    example:
      'Transfer-agent & fund-admin service fees across BUIDL/ACRED/HL funds/VBILL etc. (rates not public) + own funds (STAC) (assets/securitize)',
  },
  // A maintainer's note on a crypto underlying that nothing reads; never asked when a row is added.
  excludedReason: {
    label: 'excluded reason',
    question: 'Why is it not an RWA exposure?',
    asked: () => false,
  },
  ticker: { label: 'ticker', question: 'What is its ticker?', example: 'TSLA' },
  class: {
    label: 'underlying class',
    question: 'Which underlying class folder holds this asset group?',
    example: 'equity',
    answer: suggested,
  },
  impliesStablecoin: {
    label: 'implies stablecoin',
    question: 'Does this value make an asset a stablecoin?',
    asked: (values) => FLAG_VOCABULARIES.includes(String(values.vocabulary)),
  },
  impliesGovernance: {
    label: 'implies governance',
    question: 'Does this value make an asset a governance token?',
    asked: (values) => FLAG_VOCABULARIES.includes(String(values.vocabulary)),
  },
  makerFeeBps: { label: 'maker fee', question: 'What is its maker fee in basis points?', example: '2' },
  takerFeeBps: { label: 'taker fee', question: 'What is its taker fee in basis points?', example: '5' },
  'perp_market:makerFeeBps': {
    label: 'maker fee',
    question: "What is its maker fee in basis points, when it differs from the venue's?",
    example: '2',
  },
  'perp_market:takerFeeBps': {
    label: 'taker fee',
    question: "What is its taker fee in basis points, when it differs from the venue's?",
    example: '5',
  },
  // Only a HIP-3 dex, a venue with a parent, gives its deployer a share of the fees.
  deployerFeeShare: {
    label: 'deployer fee share',
    question: 'Which share of the fees goes to the deployer?',
    example: '0.5',
    answer: share,
    asked: (values) => values.parent !== undefined,
  },
  fundingRetentionPct: {
    label: 'funding retention',
    question: 'Which percent of the funding payments does the venue keep?',
    example: '10',
  },
  conventionNote: {
    label: 'convention note',
    question: 'How does the venue count its open interest and volume?',
    explain: 'What a reader needs to compare its numbers with other venues: funding, units, fees on top.',
    example:
      'Funding settles every 8 hours (every 4 hours on PAXGUSD and XAUTUSD), and 18% GST is charged on top of the listed trading fee. (perps/delta-india)',
  },
  aliases: { label: 'aliases', question: 'Which other symbols does the venue use for it?', example: 'TSLA-PERP' },
  website: { label: 'website', question: "Which page is its website, when it differs from the venue's?" },
  issuer: {
    label: 'issuer',
    question: 'Who issues it, when not the venue?',
    example: 'ApeX Protocol',
    answer: suggested,
  },
};
