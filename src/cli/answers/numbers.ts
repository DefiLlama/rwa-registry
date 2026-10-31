/**
 * number answers: a number, a whole number, an amount, a percent, a share, a founding year and a USD range, each refused outside its range.
 * @dev review: src/cli/answers/answerType.ts
 */
import { accepted, refused, type AnswerType } from './answerType';

const numberOf = (typed: string) => (typed.trim() !== '' && Number.isFinite(Number(typed)) ? Number(typed) : null);

const ranged = (shape: string, holds: (value: number) => boolean, reason: string): AnswerType => ({
  shape,
  read: (typed) => {
    const value = numberOf(typed);
    return value !== null && holds(value) ? accepted(value) : refused(reason);
  },
});

export const number = ranged('a number', () => true, 'not a number, as 2.5');

export const integer = ranged('a whole number', Number.isInteger, 'not a whole number, as 12');

export const amount = ranged('a number, zero or more', (value) => value >= 0, 'not a number of zero or more, as 25');

export const percent = ranged(
  'a percent, 0 to 100',
  (value) => value >= 0 && value <= 100,
  'not a percent from 0 to 100, as 10',
);

export const share = ranged('a share, 0 to 1', (value) => value >= 0 && value <= 1, 'not a share from 0 to 1, as 0.5');

// The upper bound is read on each answer, so the year a person types today is never refused.
export const year: AnswerType = {
  shape: 'a year, 1800 to this year',
  read: (typed) => {
    const now = new Date().getUTCFullYear();
    const value = numberOf(typed);
    return value !== null && Number.isInteger(value) && value >= 1800 && value <= now
      ? accepted(value)
      : refused(`not a year from 1800 to ${now}, as 2021`);
  },
};

export const usdRange: AnswerType = {
  shape: 'a range of USD as low:high',
  read: (typed) => {
    const parts = typed.split(':').map(numberOf);
    const [low, high] = parts;
    return parts.length === 2 && low != null && high != null && low >= 0 && low <= high
      ? accepted([low, high])
      : refused('not a range of USD as low:high, as 1000000:2000000');
  },
};
