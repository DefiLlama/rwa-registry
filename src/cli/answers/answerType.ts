/**
 * AnswerType: how one field is answered: a text read into the value its file holds or refused with a reason, the choices it is picked from, one answer or many; readAnswer reads a whole answer, checkAnswer runs it on Enter.
 * @dev review: src/cli/questionnaire.ts, then src/cli/answers/picks.ts
 */
import type { Registry } from '../../schema';
import type { Choice } from '../ask';
import { commaList } from '../commaList';

export type Read = { value: unknown } | { refused: string };

// The registry, and the answers given before this one, as an address reads the chain answered before it.
export interface AnswerContext {
  registry: Registry;
  values: Record<string, unknown>;
}

export type Answer = string | string[] | boolean;

export interface AnswerType {
  // What an answer is, in plain words, shown when no example says it.
  shape: string;
  read: (text: string, context: AnswerContext) => Read;
  // The list the answer is picked from; none, or an empty list, means it is typed.
  choices?: (context: AnswerContext) => Choice[] | undefined;
  // The choices suggest, and a typed text outside them is an answer too.
  open?: boolean;
  many?: boolean;
  yesNo?: boolean;
}

export const accepted = (value: unknown): Read => ({ value });

export const refused = (reason: string): Read => ({ refused: reason });

export const many = (type: AnswerType): AnswerType => ({ ...type, many: true });

export const isEmpty = (answer: unknown) =>
  answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && !answer.length);

// A list answer is split on commas, so a flag given twice and a typed "a, b" read alike.
const itemsOf = (type: AnswerType, answer: Answer): string[] =>
  type.many ? commaList(answer) : [String(answer).trim()];

const requiredReason = (type: AnswerType, context: AnswerContext) => {
  if (type.yesNo) return 'required: answer yes or no';
  if (!type.choices?.(context)?.length) return 'required: type an answer';
  return type.many ? 'required: pick at least one' : 'required: pick one';
};

// The value the file holds for an answer, one or the list of them, or why its first refused item is refused.
export const readAnswer = (type: AnswerType, answer: Answer, context: AnswerContext): Read => {
  const values: unknown[] = [];
  for (const item of itemsOf(type, answer)) {
    const read = type.read(item, context);
    if ('refused' in read) return refused(type.many ? `${item}: ${read.refused}` : read.refused);
    values.push(read.value);
  }
  return accepted(type.many ? values : values[0]);
};

export const checkAnswer =
  (type: AnswerType, required: boolean, context: AnswerContext) =>
  (answer: Answer | undefined): true | string => {
    if (isEmpty(answer)) return required ? requiredReason(type, context) : true;
    const read = readAnswer(type, answer!, context);
    return 'refused' in read ? read.refused : true;
  };
