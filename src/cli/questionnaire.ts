/**
 * askFields: a command's fields turned into its questions: every flag checked by its field's answer type before anything is asked, then each field no flag or template gives asked in order with that check on Enter, then one confirmation that lists every value.
 * @dev review: src/cli/answers/answerType.ts, src/cli/writeCommand.ts, then src/cli/commands/add-asset.ts
 */
import type { Registry } from '../schema';
import { checkAnswer, isEmpty, type Answer, type AnswerType } from './answers/answerType';
import { yesNo } from './answers/picks';
import { text } from './answers/text';
import type { Ask, Question } from './ask';
import { commaList } from './commaList';

export type FlagValue = Answer;
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
  // What the question asks for and how to answer it, where the sentence alone does not say.
  explain?: string;
  // An answer that shows the shape, taken from a real registry file where one exists; it may name an earlier answer.
  example?: string | ((values: FlagValues) => string | undefined);
  // How it is answered and checked; plain text when absent.
  answer?: AnswerType;
  required?: boolean | ((values: FlagValues) => boolean);
  // The value offered from the earlier answers, such as the canonical market id from the symbol.
  derive?: Derive;
  // What an empty answer does when it does not leave the field empty, as "Enter leaves the flag derived".
  whenEmpty?: string;
}

export interface LegField extends Asked {
  key: string;
}

// A list asked one item at a time, each item from its own questions, as a deployment from its chain, address and day.
export interface Legs {
  fields: LegField[];
  item: (leg: FlagValues) => string;
  // An item given by flag as its leg's values, or null when it does not have the item's shape.
  split: (item: string) => FlagValues | null;
  // The item's shape, named when a flag's item does not have it.
  shape: string;
  // The value the row holds for the items, as milestones joined into one text; the list itself when absent.
  join?: (items: string[]) => unknown;
  more: string;
}

// flag is a positional argument when written <name>, as delist's <target>; a flag with no value is asked yes or no.
export interface Field extends Asked {
  flag: string;
  // The field's name in plain words at the confirmation, as "token symbol".
  label?: string;
  // The value when none is given or answered, offered as the default when asked.
  fallback?: () => FlagValue;
  // A field asked only when this holds; otherwise it takes what it derives, as the primary chain of a single deployment.
  asked?: (values: FlagValues) => boolean;
  legs?: Legs;
  // Asked in a terminal or given by a --from file, with no flag of its own, as an asset's description.
  askedOnly?: boolean;
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
  // Each flag its answer type refuses, as "--founded-year abc: not a year ...", found before any question.
  refused: string[];
  cancelled: boolean;
}

// Printed once, before the first question, so no question repeats it.
export const INTRO = 'A question marked * needs an answer; Enter leaves any other one empty.';

// commander keeps --no-discover as discover: false.
export const optionKey = (flag: string) =>
  flag
    .split(' ')[0]!
    .replace(/^--(no-)?|^<|>$/g, '')
    .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

export const isArgument = (field: Field) => field.flag.startsWith('<');

const flagName = (field: Field) => field.flag.split(' ')[0]!;

const nameOf = (field: Field) => field.label ?? flagName(field).replace(/^--|^<|>$/g, '');

// A flag that takes no value, as --published, is a yes or no.
export const answerOf = (field: Asked & { flag?: string }): AnswerType =>
  field.answer ?? (field.flag?.startsWith('--') && !field.flag.includes('<') ? yesNo : text);

export { isEmpty } from './answers/answerType';

const requiredOf = (field: Asked, values: FlagValues) =>
  typeof field.required === 'function' ? field.required(values) : field.required === true;

const shown = (value: unknown) =>
  Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);

// A flag with no value, as --published, is off unless the person says yes.
const defaultOf = (field: Field) => (answerOf(field).yesNo && !field.flag.includes('<') ? false : undefined);

// The lines printed above the question: what it asks for, what an answer looks like, and what Enter takes.
const linesOf = (
  field: Asked,
  answer: AnswerType,
  offered: Derived | undefined,
  picked: boolean,
  values: FlagValues,
) => {
  const lines = field.explain ? [field.explain] : [];
  const example = typeof field.example === 'function' ? field.example(values) : field.example;
  const typed = (!picked || answer.open) && isEmpty(offered?.value);
  if (answer.yesNo) {
    const fallback = offered?.value;
    lines.push(typeof fallback === 'boolean' ? `Yes or no; Enter takes ${fallback ? 'yes' : 'no'}.` : 'Yes or no.');
  } else if (typed && example) lines.push(`Example: ${example}`);
  else if (typed && answer.shape) lines.push(`Answer: ${answer.shape}.`);
  if (!picked && answer.many) lines.push('Several answers are comma-separated.');
  if (offered?.why) lines.push(isEmpty(offered.value) ? offered.why : `Enter takes ${offered.why}.`);
  else if (!answer.yesNo && !isEmpty(offered?.value)) lines.push(`Enter takes ${shown(offered!.value)}.`);
  if (field.whenEmpty) lines.push(field.whenEmpty);
  return lines;
};

const questionOf = (
  key: string,
  field: Asked,
  answer: AnswerType,
  required: boolean,
  offered: Derived | undefined,
  context: DeriveContext,
  values: FlagValues,
): Question => {
  const checked = { registry: context.registry, values };
  const listed = answer.yesNo ? undefined : answer.choices?.(checked);
  const choices = listed?.length ? listed : undefined;
  const sentence =
    typeof field.question === 'function' ? field.question(values) : (field.question ?? field.description);
  const lines = linesOf(field, answer, offered, choices !== undefined, values);
  return {
    key,
    message: required ? `${sentence} *` : sentence,
    ...(lines.length ? { lines } : {}),
    choices,
    many: answer.many,
    open: answer.open,
    optional: !required,
    confirm: answer.yesNo,
    default: offered?.value,
    check: checkAnswer(answer, required, checked),
  };
};

// An answer its check refuses is asked again with the reason; in a terminal the check already ran on Enter.
const askChecked = async (ask: Ask, question: Question) => {
  let answer = await ask(question);
  let verdict = question.check?.(answer) ?? true;
  while (verdict !== true) {
    answer = await ask({ ...question, refused: verdict });
    verdict = question.check?.(answer) ?? true;
  }
  return answer;
};

// A yes or no asked with no field behind it, as the confirmation and another deployment.
const yesOrNo = (key: string, message: string, fallback: boolean, registry: Registry): Question => ({
  key,
  message,
  lines: [`Yes or no; Enter takes ${fallback ? 'yes' : 'no'}.`],
  confirm: true,
  default: fallback,
  check: checkAnswer(yesNo, false, { registry, values: {} }),
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

// A list whose first question is optional ends at an empty answer to it, as an asset with no other role.
const askLegs = async (key: string, legs: Legs, values: FlagValues, context: DeriveContext, ask: Ask) => {
  const items: string[] = [];
  do {
    const leg: FlagValues = {};
    for (const [index, field] of legs.fields.entries()) {
      const required = requiredOf(field, leg);
      const derived = await field.derive?.({ ...values, ...leg }, context);
      const answer = answerOf(field);
      const question = questionOf(`${key}.${field.key}`, field, answer, required, derived, context, {
        ...values,
        ...leg,
      });
      const given = await askChecked(ask, question);
      if (index === 0 && !required && isEmpty(given)) return items;
      leg[field.key] = isEmpty(given) ? undefined : (given as FlagValue);
    }
    items.push(legs.item(leg));
  } while ((await askChecked(ask, yesOrNo(`${key}.more`, legs.more, false, context.registry))) === true);
  return items;
};

// Why one flag's value is refused: its item shape, or the reason its answer type gives, with the flag and the value named.
const flagRefusals = (field: Field, value: FlagValue, values: FlagValues, registry: Registry): string[] => {
  const flag = flagName(field);
  if (!field.legs) {
    const answer = answerOf(field);
    const verdict = checkAnswer(answer, false, { registry, values })(value);
    if (verdict === true) return [];
    // A positional argument is named by its value, as the files' refusals name a slug.
    if (isArgument(field)) return [`${shown(value)}: ${verdict}`];
    return [answer.many ? `${flag} ${verdict}` : `${flag} ${shown(value)}: ${verdict}`];
  }
  return commaList(value).flatMap((item) => {
    const leg = field.legs!.split(item);
    if (!leg) return [`${flag} ${item}: not ${field.legs!.shape}`];
    return field.legs!.fields.flatMap((part) => {
      const verdict = checkAnswer(answerOf(part), false, { registry, values: { ...values, ...leg } })(leg[part.key]);
      return verdict === true ? [] : [`${flag} ${item}: ${verdict}`];
    });
  });
};

// Every flag given, checked in field order, so an address is read on the chain given before it.
const refusalsOf = (fields: Field[], flags: FlagValues, given: Record<string, unknown>, registry: Registry) => {
  const values: FlagValues = {};
  return fields.flatMap((field) => {
    const key = optionKey(field.flag);
    const value = flags[key];
    if (!isEmpty(given[key]) || isEmpty(value) || flagName(field).startsWith('--no-')) return [];
    values[key] = value;
    return flagRefusals(field, value!, values, registry);
  });
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
  const refused = refusalsOf(fields, input.flags, input.given, context.registry);
  if (refused.length) return { values, missing, refused, cancelled: false };
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
    let fromLegs = false;
    if (isEmpty(value) && ask && (every || required) && !flagName(field).startsWith('--no-')) {
      const derived = await field.derive?.(values, context);
      const fallback = field.fallback ? field.fallback() : defaultOf(field);
      const offered = derived ?? (fallback === undefined ? undefined : { value: fallback });
      const unasked = field.asked?.(values) === false;
      if (unasked) value = derived?.value;
      else {
        if (!asked) context.note(INTRO);
        asked = true;
        fromLegs = field.legs !== undefined;
        value = field.legs
          ? await askLegs(key, field.legs, values, context, ask)
          : ((await askChecked(
              ask,
              questionOf(key, field, answerOf(field), required, offered, context, values),
            )) as FlagValue);
      }
      const same = !isEmpty(value) && shown(value) === shown(derived?.value);
      if (same || !unasked) origins.set(key, same ? 'derived' : 'answer');
    }
    if (isEmpty(value)) value = field.fallback?.();
    // The leg questions give their items as a list already, and a milestone's text may hold a comma.
    if (!fromLegs && (field.legs || answerOf(field).many) && value !== undefined)
      value = commaList(value as string | string[]);
    if (isEmpty(value) && required) missing.push(flagName(field));
    values[key] = isEmpty(value) ? undefined : value;
  }
  if (!asked || !every || !ask || missing.length) return { values, missing, refused, cancelled: false };
  const all = { ...input.given, ...values };
  const assigned = (questionnaire.assigned ?? []).map(
    ({ name, derive }) => [name, derive(all, context)] as [string, unknown],
  );
  const message = summary(fields, all, origins, assigned);
  const yes = await askChecked(ask, yesOrNo('confirm', message, true, context.registry));
  return { values, missing, refused, cancelled: yes !== true };
};
