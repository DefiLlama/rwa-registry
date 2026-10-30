/**
 * askFields: a command's fields turned into its questions, asked in the order they are listed, a flag, an argument or a template field skipping its own, then one confirmation that lists every value.
 * @dev review: src/cli/writeCommand.ts, then src/cli/commands/add-asset.ts
 */
import type { Registry } from '../schema';
import type { Ask, Choice, Question } from './ask';
import { commaList } from './commaList';

export type FlagValue = string | string[] | boolean;
export type FlagValues = Record<string, FlagValue | undefined>;

export interface WriteContext {
  args: string[];
  root: string;
  read: (path: string) => unknown;
  // A line for the person running it, printed before the files, or kept in the JSON under --json.
  note: (line: string) => void;
  // What a question derived for the files to reuse, such as the venue's listing answer.
  memo: Map<string, unknown>;
}

export interface DeriveContext extends WriteContext {
  registry: Registry;
  flags: FlagValues;
}

// A value offered as the answer, and why, such as a deployment date and the explorer that gave it.
export interface Derived {
  value?: FlagValue;
  why?: string;
}

export type Derive = (values: FlagValues, context: DeriveContext) => Derived | undefined | Promise<Derived | undefined>;

// What a question needs, for a field and for one field of a leg.
interface Asked {
  // The flag's --help text; the person reads the question.
  description: string;
  // One plain question a newcomer reads without the schema, as "Which chain is the token deployed on?"; it may name an earlier answer.
  question?: string | ((values: FlagValues) => string);
  // An answer that shows the shape, printed after the question as (example: TSLAx).
  example?: string;
  // A hint that replaces the one the question would get, as an override's Enter that leaves it derived.
  hint?: string;
  required?: boolean | ((values: FlagValues) => boolean);
  // The choices may hang on the earlier answers, as a slug on its target's kind.
  choices?: (registry: Registry, values: FlagValues) => Choice[];
  // The choices are suggestions; any typed text is an answer.
  open?: boolean;
  date?: boolean;
  // The value offered from the earlier answers, such as the canonical market id from the symbol.
  derive?: Derive;
}

export interface LegField extends Asked {
  key: string;
}

// A list asked one item at a time, each item from its own questions, as a deployment from its chain, address and day.
export interface Legs {
  fields: LegField[];
  item: (leg: FlagValues) => string;
  more: string;
}

// flag is a positional argument when written <name>, as delist's <target>; a <bool> flag and a flag with no value are asked yes or no.
export interface Field extends Asked {
  flag: string;
  // The field's name in plain words at the confirmation, as "token symbol".
  label?: string;
  // The answer Enter takes when the field is asked, as yes for a token that can move between wallets; unlike a fallback, nothing is taken when it is not asked.
  default?: FlagValue;
  list?: boolean;
  // The value when none is given or answered, offered as the default when asked.
  fallback?: () => FlagValue;
  // A field asked only when this holds; otherwise it takes what it derives, as the primary chain of a single deployment.
  asked?: (values: FlagValues) => boolean;
  legs?: Legs;
}

// A value the command assigns with no flag of its own, shown at the confirmation, as an asset's legacy id.
export interface Assigned {
  name: string;
  derive: (values: Record<string, unknown>, context: DeriveContext) => unknown;
}

export interface Questionnaire {
  fields: Field[];
  assigned?: Assigned[];
  // Every field is asked; otherwise only a missing required one, as set asks.
  every?: boolean;
}

export interface Answers {
  values: FlagValues;
  missing: string[];
  cancelled: boolean;
}

// commander keeps --no-discover as discover: false.
export const optionKey = (flag: string) =>
  flag
    .split(' ')[0]!
    .replace(/^--(no-)?|^<|>$/g, '')
    .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

export const isArgument = (field: Field) => field.flag.startsWith('<');

const flagName = (field: Field) => field.flag.split(' ')[0]!;

const nameOf = (field: Field) => field.label ?? flagName(field).replace(/^--|^<|>$/g, '');

// A <bool> flag, or a flag that takes no value as --published.
const isYesNo = (field: Asked) =>
  'flag' in field && (!String(field.flag).includes('<') || String(field.flag).includes('<bool>'));

export const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

const requiredOf = (field: Asked, values: FlagValues) =>
  typeof field.required === 'function' ? field.required(values) : field.required === true;

const shown = (value: unknown) =>
  Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);

// A flag with no value, as --published, is off unless the person says yes.
const defaultOf = (field: Field) => field.default ?? (field.flag.includes('<') ? undefined : false);

const EMPTY = 'Enter to leave empty';

// What follows the question in brackets: the example, why a value is offered, or that Enter leaves it empty.
const hintsOf = (field: Asked, required: boolean, offered: Derived | undefined, choices: unknown[] | undefined) => {
  if (field.hint) return [field.hint];
  if (isYesNo(field)) {
    if (typeof offered?.value === 'boolean') return [`yes or no, default ${offered.value ? 'yes' : 'no'}`];
    return [required ? 'yes or no' : `yes or no; ${EMPTY}`];
  }
  const hints: string[] = [];
  // An example shows the shape of a typed answer; a list, or a value Enter takes, already does.
  if (field.example && (!choices?.length || field.open) && isEmpty(offered?.value))
    hints.push(`example: ${field.example}`);
  if (offered?.why) hints.push(isEmpty(offered.value) ? offered.why : `Enter for ${offered.why}`);
  if (!required && isEmpty(offered?.value)) hints.push(EMPTY);
  return hints;
};

// A yes or no asked with no field behind it, as the confirmation and another deployment.
const yesOrNo = (key: string, message: string, fallback: boolean): Question => ({
  key,
  message: `${message} (yes or no, default ${fallback ? 'yes' : 'no'})`,
  confirm: true,
  default: fallback,
});

type Origin = 'flag' | 'answer' | 'file' | 'derived';

const TAGS: Record<Origin, string> = { flag: '', answer: '', file: ' (from the file)', derived: ' (derived)' };

// Every field with its value and where it came from, the ones left empty on one line.
const summary = (
  fields: Field[],
  values: Record<string, unknown>,
  origins: Map<string, Origin>,
  assigned: [string, unknown][],
): string => {
  // A --no- flag is never asked, so it is not listed either.
  const keys = fields
    .filter((field) => !flagName(field).startsWith('--no-'))
    .map((field) => [optionKey(field.flag), nameOf(field)] as const);
  const set = keys.filter(([key]) => !isEmpty(values[key]));
  const empty = keys.filter(([key]) => isEmpty(values[key]) && origins.get(key) === 'answer');
  return [
    'These fields will be written:',
    ...set.map(([key, name]) => `  ${name}: ${shown(values[key])}${TAGS[origins.get(key) ?? 'flag']}`),
    ...assigned.flatMap(([name, value]) => (isEmpty(value) ? [] : [`  ${name}: ${shown(value)} (assigned)`])),
    ...(empty.length ? [`  left empty: ${empty.map(([, name]) => name).join(', ')}`] : []),
    'Write them?',
  ].join('\n');
};

const questionOf = (
  key: string,
  field: Asked & { list?: boolean },
  required: boolean,
  offered: Derived | undefined,
  context: DeriveContext,
  values: FlagValues,
): Question => {
  const choices = isYesNo(field) ? undefined : field.choices?.(context.registry, values);
  const text = typeof field.question === 'function' ? field.question(values) : (field.question ?? field.description);
  const hints = hintsOf(field, required, offered, choices);
  return {
    key,
    message: hints.length ? `${text} (${hints.join('; ')})` : text,
    choices,
    list: field.list,
    optional: !required,
    open: field.open,
    date: field.date,
    confirm: isYesNo(field) || undefined,
    default: offered?.value,
  };
};

// A required field answered empty is asked again, its question saying why, until it has an answer.
const askRequired = async (ask: Ask, question: Question, required: boolean) => {
  let answer = await ask(question);
  while (required && isEmpty(answer)) {
    const why = question.confirm
      ? 'required: answer yes or no'
      : question.list
        ? 'required: pick at least one'
        : question.choices?.length
          ? 'required: pick one'
          : 'required: type an answer';
    answer = await ask({ ...question, message: `${question.message} (${why})` });
  }
  return answer;
};

const askLegs = async (key: string, legs: Legs, values: FlagValues, context: DeriveContext, ask: Ask) => {
  const items: string[] = [];
  do {
    const leg: FlagValues = {};
    for (const field of legs.fields) {
      const required = requiredOf(field, leg);
      const derived = await field.derive?.({ ...values, ...leg }, context);
      const question = questionOf(`${key}.${field.key}`, field, required, derived, context, { ...values, ...leg });
      const answer = await askRequired(ask, question, required);
      leg[field.key] = isEmpty(answer) ? undefined : (answer as FlagValue);
    }
    items.push(legs.item(leg));
  } while ((await ask(yesOrNo(`${key}.more`, legs.more, false))) === true);
  return items;
};

export const askFields = async (
  questionnaire: Questionnaire,
  input: { flags: FlagValues; given: Record<string, unknown>; context: DeriveContext },
  ask: Ask | null,
): Promise<Answers> => {
  const { fields, every = false } = questionnaire;
  const { context } = input;
  const values: FlagValues = {};
  const missing: string[] = [];
  const origins = new Map<string, Origin>();
  let asked = false;
  for (const field of fields) {
    const key = optionKey(field.flag);
    if (!isEmpty(input.given[key])) {
      origins.set(key, 'file');
      continue;
    }
    const required = requiredOf(field, values);
    let value = input.flags[key];
    if (isEmpty(value) && ask && (every || required) && !flagName(field).startsWith('--no-')) {
      const derived = await field.derive?.(values, context);
      const offered =
        derived ??
        (field.fallback
          ? { value: field.fallback() }
          : defaultOf(field) === undefined
            ? undefined
            : { value: defaultOf(field)! });
      const unasked = field.asked?.(values) === false;
      if (unasked) value = derived?.value;
      else {
        asked = true;
        value = field.legs
          ? await askLegs(key, field.legs, values, context, ask)
          : ((await askRequired(
              ask,
              questionOf(key, field, required, offered, context, values),
              required,
            )) as FlagValue);
      }
      const same = !isEmpty(value) && shown(value) === shown(derived?.value);
      if (same || !unasked) origins.set(key, same ? 'derived' : 'answer');
    }
    if (isEmpty(value)) value = field.fallback?.();
    if (field.list && value !== undefined) value = commaList(value as string | string[]);
    if (isEmpty(value) && required) missing.push(flagName(field));
    values[key] = isEmpty(value) ? undefined : value;
  }
  if (!asked || !every || !ask || missing.length) return { values, missing, cancelled: false };
  const all = { ...input.given, ...values };
  const assigned = (questionnaire.assigned ?? []).map(
    ({ name, derive }) => [name, derive(all, context)] as [string, unknown],
  );
  const message = summary(fields, all, origins, assigned);
  const yes = await ask(yesOrNo('confirm', message, true));
  return { values, missing, cancelled: yes !== true };
};
