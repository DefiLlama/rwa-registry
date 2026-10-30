/**
 * schemaFields: an add command's questions made whole from its table's schema: the fields no flag asks become questions with no flag, then every question is ordered, the required ones first and the optional ones block by block; answersRow lays their answers out as the row.
 * @dev review: src/cli/addCommand.ts, then src/schema/asset.ts
 */
import { z } from 'zod';
import { FlagFormatError } from '../errors/cli';
import { blockFields, CHILD_KEYS, tables, type Registry, type TableName, type VocabularyName } from '../schema';
import type { AnyTableDefinition, VocabularyTypes } from '../schema/defineTable';
import { identifier } from '../schema/identifier';
import { date, integer, protocolId, ref } from '../schema/primitives';
import type { Choice } from './ask';
import { isEmpty, optionKey, type Field, type FlagValue, type FlagValues } from './questionnaire';

// A question of an add command: row names the field it fills when its flag names it otherwise; a question with no flag also carries its path in the row and how its answer becomes the value.
export type AddField = Field & {
  row?: string;
  // Asked with the required fields, as an earlier answer a required field hangs on.
  lead?: boolean;
  path?: string[];
  toRow?: (answer: FlagValue) => unknown;
};

interface Def {
  type: string;
  innerType?: Schema;
  element?: Schema;
  shape?: Record<string, Schema>;
  entries?: Record<string, string>;
}
interface Schema {
  def: Def;
}

type Kind = 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'choice' | 'reference' | 'identifier' | 'protocol';

interface Leaf {
  path: string[];
  kind: Kind;
  list: boolean;
  vocabulary?: VocabularyName;
  entries?: string[];
}

// The vocabulary each field is built from, read back from the schema by identity.
const vocabularies = new Map<unknown, VocabularyName>();
const VOCABULARY_PROBE = new Proxy({} as VocabularyTypes, {
  get: (_, name: VocabularyName) => {
    const type = z.string();
    vocabularies.set(type, name);
    return type;
  },
});

const unwrapped = (schema: Schema): Schema => {
  let at = schema;
  while (at.def.type === 'optional' || at.def.type === 'nullable') at = at.def.innerType!;
  return at;
};

// A nested block such as links or fees gives one leaf per key; any other field is one leaf.
const leavesOf = (path: string[], schema: Schema, list = false): Leaf[] => {
  const at = unwrapped(schema);
  const { def } = at;
  if ((at as unknown) === identifier) return [{ path, kind: 'identifier', list }];
  if (def.type === 'array') return leavesOf(path, def.element!, true);
  if (def.type === 'object')
    return Object.entries(def.shape!).flatMap(([key, inner]) => leavesOf([...path, key], inner));
  if ((at as unknown) === protocolId) return [{ path, kind: 'protocol', list }];
  if ((at as unknown) === integer) return [{ path, kind: 'integer', list }];
  if ((at as unknown) === date) return [{ path, kind: 'date', list }];
  if ((at as unknown) === ref) return [{ path, kind: 'reference', list }];
  if (vocabularies.has(at)) return [{ path, kind: 'choice', list, vocabulary: vocabularies.get(at) }];
  if (def.type === 'enum') return [{ path, kind: 'choice', list, entries: Object.values(def.entries!) }];
  if (def.type === 'number') return [{ path, kind: 'number', list }];
  if (def.type === 'boolean') return [{ path, kind: 'boolean', list }];
  return [{ path, kind: 'text', list }];
};

// One plain question per field, and the label the confirmation shows; a field missing here is worded from its name.
const WORDING: Record<string, { label: string; question: string; example?: string }> = {
  wraps: { label: 'wrapped token', question: 'Which token in the registry does it wrap, when it wraps one?' },
  protocolIds: {
    label: 'DefiLlama protocol ids',
    question: 'Which DefiLlama protocol ids does it map to?',
    example: '2525, parent#ondo-finance',
  },
  yieldPoolIds: {
    label: 'yield pool ids',
    question: 'Which DefiLlama yield pools may give its native yield?',
    example: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  },
  identifiers: {
    label: 'identifiers',
    question: 'Which ISIN, FIGI or LEI identifies it?',
    example: 'isin:US88160R1014',
  },
  documents: {
    label: 'documents',
    question: 'Which documents does the issuer publish for it?',
    example: 'https://issuer.example/offering.pdf',
  },
  description: { label: 'description', question: 'How would you describe it in a sentence or two?' },
  logo: {
    label: 'logo',
    question: 'Which link holds its logo?',
    example: 'https://icons.llamao.fi/icons/protocols/xstocks',
  },
  'links.website': { label: 'website', question: 'Which pages are its website?', example: 'https://xstocks.fi' },
  'links.twitter': {
    label: 'Twitter',
    question: 'Which Twitter account does it post from?',
    example: 'https://x.com/xStocksFi',
  },
  'links.docs': { label: 'docs', question: 'Where are its docs?' },
  'links.linkedin': { label: 'LinkedIn', question: 'Which LinkedIn page does it have?' },
  'links.discord': { label: 'Discord', question: 'Which Discord server does it run?' },
  'links.telegram': { label: 'Telegram', question: 'Which Telegram group does it run?' },
  'links.github': { label: 'GitHub', question: 'Which GitHub organization holds its code?' },
  'links.refLinks': { label: 'reference links', question: 'Which other pages describe it?' },
  parent: { label: 'parent organization', question: 'Which organization does it belong to?' },
  protocolSlug: { label: 'DefiLlama protocol slug', question: 'Which DefiLlama protocol slug does it have?' },
  registryInfo: { label: 'company registry entry', question: 'Which company registry entry names it?' },
  foundedYear: { label: 'founding year', question: 'In which year was it founded?', example: '2021' },
  headquarters: { label: 'headquarters', question: 'Where are its headquarters?', example: 'Zug, Switzerland' },
  founders: { label: 'founders', question: 'Who founded it?' },
  regulatoryStatus: { label: 'regulatory status', question: 'How is it regulated?' },
  keyMilestones: { label: 'key milestones', question: 'Which milestones mark its history?' },
  entityStructureNotes: { label: 'entity structure', question: 'How is its legal entity structured?' },
  category: { label: 'categories', question: 'Which categories does it list its assets under?' },
  platformType: { label: 'asset classes', question: 'Which asset classes does it issue?' },
  accessModel: { label: 'access model', question: 'Who can buy its assets?' },
  primaryChain: { label: 'primary chain', question: 'Which chain does it mainly issue on?' },
  chains: { label: 'chains', question: 'Which chains does it issue on?', example: 'ethereum, solana' },
  attestationFrequency: {
    label: 'attestation frequency',
    question: 'How often is its backing attested?',
    example: 'monthly',
  },
  onchainMcapBasis: { label: 'onchain mcap basis', question: 'Which supply does its onchain market cap count?' },
  fees: { label: 'fee terms', question: 'Fill in its fee terms now?' },
  excludedReason: { label: 'excluded reason', question: 'Why is it left out of the totals, when it is?' },
  ticker: { label: 'ticker', question: 'What is its ticker?', example: 'TSLA' },
  class: {
    label: 'underlying class',
    question: 'Which underlying class folder holds this asset group?',
    example: 'equity',
  },
  impliesStablecoin: { label: 'implies stablecoin', question: 'Does this value make an asset a stablecoin?' },
  impliesGovernance: { label: 'implies governance', question: 'Does this value make an asset a governance token?' },
  makerFeeBps: { label: 'maker fee', question: 'What is its maker fee in basis points?', example: '2' },
  takerFeeBps: { label: 'taker fee', question: 'What is its taker fee in basis points?', example: '5' },
  deployerFeeShare: {
    label: 'deployer fee share',
    question: 'Which share of the fees goes to the deployer?',
    example: '0.5',
  },
  fundingRetentionPct: {
    label: 'funding retention',
    question: 'Which percent of the funding payments does the venue keep?',
    example: '10',
  },
  conventionNote: { label: 'convention note', question: 'How does the venue count its open interest and volume?' },
  aliases: { label: 'aliases', question: 'Which other symbols does the venue use for it?', example: 'TSLA-PERP' },
  website: { label: 'website', question: "Which page is its website, when it differs from the venue's?" },
  issuer: { label: 'issuer', question: 'Who issues it, when not the venue?' },
};

const WORDS: Record<string, string> = {
  bps: 'in basis points',
  pct: 'in percent',
  usd: 'in US dollars',
  url: 'link',
  yr: 'year',
  tcs: 'terms and conditions',
};

const wordsOf = (name: string) =>
  name
    .split(/(?=[A-Z])/)
    .map((word) => WORDS[word.toLowerCase()] ?? word.toLowerCase())
    .join(' ');

const wordingOf = (leaf: Leaf) => {
  const known = WORDING[leaf.path.join('.')];
  if (known) return known;
  const label = wordsOf(leaf.path.at(-1)!);
  return { label, question: leaf.kind === 'boolean' ? `Does it have ${label}?` : `What is its ${label}?` };
};

const byName = <T extends { slug: string; name?: string | null; symbol?: string }>(rows: T[]): Choice[] =>
  rows
    .map((row) => ({ value: row.slug, name: row.name ?? row.symbol ?? row.slug }))
    .sort((a, b) => a.name.localeCompare(b.name));

const chains = (registry: Registry): Choice[] => [...new Set(registry.deployment.map((row) => row.chain))].sort();

// A reference is offered from the registry's rows when there are fewer than this many; otherwise it is typed.
const OFFERED = 50;

const REFERENCES: Record<string, (registry: Registry) => Choice[]> = {
  wraps: (registry) => byName(registry.asset),
  tracksAsset: (registry) => byName(registry.asset),
  collateral: (registry) => byName(registry.asset),
  tracks: (registry) => byName(registry.underlying),
  parent: (registry) => byName(registry.organization),
  organization: (registry) => byName(registry.organization),
  chain: chains,
  primaryChain: chains,
  chains,
};

const choicesOf = (leaf: Leaf): Field['choices'] => {
  if (leaf.vocabulary) {
    const name = leaf.vocabulary;
    return (registry) =>
      registry.vocabulary
        .filter((row) => row.vocabulary === name)
        .map((row) => ({ value: row.slug, name: row.label ?? row.slug }));
  }
  if (leaf.entries) {
    const entries = leaf.entries;
    return () => entries;
  }
  const reference = leaf.kind === 'reference' ? REFERENCES[leaf.path.at(-1)!] : undefined;
  if (!reference) return undefined;
  return (registry) => {
    const offered = reference(registry);
    return offered.length < OFFERED ? offered : [];
  };
};

// The typed answer as the schema holds it: a number, a protocol id, an identifier as scheme:value, else the text.
const valueOf = (leaf: Leaf, text: string): unknown => {
  const at = leaf.path.join('.');
  if (leaf.kind === 'number' || leaf.kind === 'integer') {
    const value = Number(text);
    if (text === '' || Number.isNaN(value) || (leaf.kind === 'integer' && !Number.isInteger(value)))
      throw new FlagFormatError({
        file: at,
        message: `${text} is not ${leaf.kind === 'integer' ? 'a whole number' : 'a number'}`,
      });
    return value;
  }
  if (leaf.kind === 'protocol') return /^\d+$/.test(text) ? Number(text) : text;
  if (leaf.kind === 'identifier') {
    const match = /^([a-z]+):(.+)$/i.exec(text);
    if (!match)
      throw new FlagFormatError({ file: at, message: `${text} is not <scheme>:<value>, as isin:US88160R1014` });
    return { scheme: match[1]!.toLowerCase(), value: match[2]!.trim() };
  }
  return text;
};

const toRowOf = (leaf: Leaf) => (answer: FlagValue) => {
  if (typeof answer === 'boolean') return answer;
  if (leaf.list) return [answer].flat().map((item) => valueOf(leaf, String(item)));
  return valueOf(leaf, String(answer));
};

const kebab = (path: string[]) =>
  path.map((step) => step.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)).join('-');

const questionOf = (leaf: Leaf, asked?: Field['asked']): AddField => {
  const { label, question, example } = wordingOf(leaf);
  const choices = choicesOf(leaf);
  return {
    flag: `--${kebab(leaf.path)} <${leaf.kind === 'boolean' ? 'bool' : 'value'}>`,
    description: label,
    label,
    question,
    ...(example ? { example } : {}),
    ...(leaf.list ? { list: true } : {}),
    ...(choices ? { choices } : {}),
    ...(leaf.kind === 'date' ? { date: true } : {}),
    ...(asked ? { asked } : {}),
    askedOnly: true,
    row: leaf.path[0],
    path: leaf.path,
    toRow: toRowOf(leaf),
  };
};

// A block holding more fields than this, as a platform's fee terms, is asked behind one yes or no.
const GATED = 8;

const questionsOf = (field: string, schema: Schema): AddField[] => {
  const leaves = leavesOf([field], schema);
  if (leaves.length <= GATED) return leaves.map((leaf) => questionOf(leaf));
  const gate = questionOf({ path: [field], kind: 'boolean', list: false });
  const key = `${field}Now`;
  const opened = (values: FlagValues) => values[key] === true;
  return [
    { ...gate, flag: `--${kebab([field])}-now <bool>`, path: undefined, toRow: undefined },
    ...leaves.map((leaf) => questionOf(leaf, opened)),
  ];
};

const rowOf = (field: AddField) => field.path?.[0] ?? field.row ?? optionKey(field.flag);

const requiredOf = (field: AddField) =>
  field.lead === true || (typeof field.required === 'function' ? field.required({}) : field.required === true);

// Where a field's optional question sits: its block in the file's order, then a field outside every block in schema order, then the nested lists.
const placeOf = (table: TableName) => {
  const definition = tables[table] as AnyTableDefinition;
  const order = [
    ...Object.keys(definition.blocks ?? {}).flatMap((block) => blockFields(table, block)),
    ...Object.keys(definition.fields(VOCABULARY_PROBE)),
    ...CHILD_KEYS,
  ];
  return (field: AddField) => {
    const at = order.indexOf(rowOf(field));
    return at === -1 ? order.length : at;
  };
};

export interface SchemaSpec {
  table: TableName;
  // The questions written by hand, with their flags, in dependency order.
  fields: AddField[];
  // The fields the command fills itself and never asks, as the slug from the name.
  derived?: string[];
  // The blocks the file of this kind leaves out, as an issuer's platform block.
  omits?: string[];
}

// Every field the file may hold is asked: the hand-written questions, then one with no flag for each field no question fills; the required ones first in their written order, then the optional ones by their place in the file.
export const schemaFields = ({ table, fields, derived = [], omits = [] }: SchemaSpec): AddField[] => {
  const definition = tables[table] as AnyTableDefinition;
  const shape = definition.fields(VOCABULARY_PROBE) as unknown as Record<string, Schema>;
  const covered = new Set(fields.map(rowOf));
  const left = new Set([
    ...covered,
    ...derived,
    ...(definition.build ?? []),
    ...(definition.implied ? [definition.implied] : []),
    ...omits.flatMap((block) => blockFields(table, block)),
  ]);
  const generated = Object.entries(shape)
    .filter(([field]) => !left.has(field))
    .flatMap(([field, schema]) => questionsOf(field, schema));
  const all = [...fields, ...generated];
  const place = placeOf(table);
  const optional = all.filter((field) => !requiredOf(field));
  return [
    ...all.filter(requiredOf),
    ...optional
      .map((field, index) => ({ field, index }))
      .sort((a, b) => place(a.field) - place(b.field) || a.index - b.index)
      .map(({ field }) => field),
  ];
};

const setAt = (row: Record<string, unknown>, path: string[], value: unknown) => {
  let at = row;
  for (const step of path.slice(0, -1)) at = (at[step] ??= {}) as Record<string, unknown>;
  at[path.at(-1)!] = value;
};

// The answers to the questions with no flag, laid out as the row holds them.
export const answersRow = (fields: AddField[], values: FlagValues): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[optionKey(field.flag)];
    if (!field.path || !field.toRow || isEmpty(value)) continue;
    setAt(row, field.path, field.toRow(value!));
  }
  return row;
};

// The value a --from template gives a question, read at its path.
export const templateValue = (field: AddField, template: Record<string, unknown>): unknown => {
  if (!field.path) return template[field.row ?? optionKey(field.flag)];
  let at: unknown = template;
  for (const step of field.path) at = at && typeof at === 'object' ? (at as Record<string, unknown>)[step] : undefined;
  return at;
};
