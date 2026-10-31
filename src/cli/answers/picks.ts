/**
 * pick answers: a yes or no, one of a list, a value of a vocabulary, a row a reference may name (the rows validate's references check allows) and a chain, picked from those the sdk and the registry know or typed when new.
 * @dev review: src/registry/checks/references.ts, src/registry/chains.ts
 */
import { keyOf, rowsOf, type AnyRow } from '../../registry/keys';
import { sdkChains } from '../../registry/chains';
import { REFERENCES, tableOf, type Named } from '../../registry/checks/references';
import type { Registry, TableName, VocabularyName } from '../../schema';
import { distance, nearest } from '../../utils/nearest';
import type { Choice } from '../ask';
import { accepted, refused, type AnswerContext, type AnswerType } from './answerType';

// A typed yes or no, the flag texts true and false included; undefined for any other text.
export const yesNoOf = (typed: string): boolean | undefined => {
  if (/^(y|yes|true)$/i.test(typed.trim())) return true;
  if (/^(n|no|false)$/i.test(typed.trim())) return false;
  return undefined;
};

export const yesNo: AnswerType = {
  shape: 'yes or no',
  yesNo: true,
  read: (typed) => {
    const answer = yesNoOf(typed);
    return answer === undefined ? refused('answer yes or no') : accepted(answer);
  },
};

const valueOf = (choice: Choice) => (typeof choice === 'string' ? choice : choice.value);

// The closest value when it is a few edits away, as stocks-equity for stocks-equities; none when every value is far.
const closeTo = (typed: string, values: string[]) => {
  const near = nearest(typed, values);
  return distance(typed, near) <= Math.max(2, Math.floor(typed.length / 3)) ? near : undefined;
};

// A short list is named in full, as "not organization or underlying"; a long one offers its closest value.
const notListed = (typed: string, values: string[]) => {
  if (values.length <= 4)
    return `not ${values.slice(0, -1).join(', ')}${values.length > 1 ? ' or ' : ''}${values.at(-1)}`;
  const near = closeTo(typed, values);
  return near ? `not in the list; did you mean ${near}` : 'not in the list';
};

// A text outside the list is refused; an empty list checks nothing, as the earlier answer it hangs on refused.
const pick = (
  shape: string,
  choices: (context: AnswerContext) => Choice[],
  missing: (typed: string, values: string[]) => string = notListed,
): AnswerType => ({
  shape,
  choices,
  read: (typed, context) => {
    const values = choices(context).map(valueOf);
    if (!values.length || values.includes(typed)) return accepted(typed);
    return refused(missing(typed, values));
  },
});

export const oneOf = (list: readonly string[] | ((context: AnswerContext) => Choice[])): AnswerType =>
  pick('one of the list', typeof list === 'function' ? list : () => [...list]);

export const vocabulary = (name: VocabularyName, keep: (slug: string) => boolean = () => true): AnswerType =>
  pick(`one of the ${name} values`, ({ registry }) =>
    registry.vocabulary
      .filter((row) => row.vocabulary === name && keep(row.slug))
      .map((row) => ({ value: row.slug, name: row.label ?? row.slug })),
  );

// Rows shown by name and answered by key, sorted by name, every row however many.
const byName = (table: TableName, rows: AnyRow[]): Choice[] =>
  rows
    .map((row) => {
      const key = keyOf(table, row);
      return { value: key, name: String(row.name ?? row.symbol ?? key) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

// A missing row names the command that adds it.
const missingRow = (names: string, add: string) => (typed: string, values: string[]) => {
  const near = closeTo(typed, values);
  return [`no ${names} ${typed} in the registry`, near && `did you mean ${near}`, `add it first with ${add}`]
    .filter(Boolean)
    .join('; ');
};

const ADD_COMMAND: Partial<Record<TableName, string>> = {
  organization: 'add organization',
  underlying: 'add underlying',
  asset: 'add asset',
  venue: 'add venue',
};

const rowsNamed = (registry: Registry, named: Named) =>
  rowsOf(registry, tableOf(named)).filter((row) => typeof named === 'string' || row.class === named.class);

export const reference = (...named: Named[]): AnswerType => {
  const names = named.map(tableOf).join(' or ');
  return pick(
    `one of the registry's ${names} rows`,
    ({ registry }) => named.flatMap((one) => byName(tableOf(one), rowsNamed(registry, one))),
    missingRow(names, ADD_COMMAND[tableOf(named[0]!)]!),
  );
};

export const platform: AnswerType = pick(
  "one of the registry's platforms",
  ({ registry }) =>
    byName(
      'organization',
      rowsOf(registry, 'organization').filter((row) => row.kind === 'platform'),
    ),
  missingRow('platform', 'add platform'),
);

// The rows validate lets this field name, so a question and the check agree.
export const referenceOf = (table: TableName, field: string): AnswerType => {
  const entry = REFERENCES[table]?.find(([name]) => name === field);
  if (!entry) throw new Error(`${table}.${field} is not a reference`);
  const [, ...named] = entry;
  return reference(...named);
};

// A chain the registry already holds stays a choice although the sdk lacks it, since validate only warns on it.
const heldChains = (registry: Registry) => [
  ...registry.deployment.map((row) => row.chain),
  ...registry.venue.flatMap((row) => (row.chain ? [row.chain] : [])),
  ...registry.organization.flatMap((row) => [...(row.chains ?? []), ...(row.primaryChain ? [row.primaryChain] : [])]),
];

const knownChains = (registry: Registry) => [...new Set([...sdkChains(), ...heldChains(registry)])].sort();

// A new chain is written as named (docs/model.md); a few edits from a chain the registry uses, it is a misspelling.
export const chain: AnswerType = {
  shape: 'a chain key, as the sdk names it',
  open: true,
  choices: ({ registry }) => knownChains(registry),
  read: (typed, { registry }) => {
    const known = knownChains(registry);
    if (known.includes(typed)) return accepted(typed);
    if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(typed))
      return refused('not a chain key; a chain key is lower case, with hyphens or underscores, as plume_mainnet');
    const near = closeTo(typed, [...new Set(heldChains(registry))]);
    return near ? refused(`not a chain the sdk or the registry knows; did you mean ${near}`) : accepted(typed);
  },
};
