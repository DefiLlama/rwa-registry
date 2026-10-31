/**
 * day answers: a calendar day as the schema's date type reads it, a day or unknown for one left out on purpose, and the period of a milestone.
 * @dev review: src/schema/primitives.ts
 */
import { date } from '../../schema/primitives';
import { accepted, refused, type AnswerType } from './answerType';

export const UNKNOWN = 'unknown';

export const day: AnswerType = {
  shape: 'a day as YYYY-MM-DD',
  read: (typed) =>
    date.safeParse(typed).success ? accepted(typed) : refused('not a day; a day is YYYY-MM-DD, as 2025-06-30'),
};

export const dayOrUnknown: AnswerType = {
  shape: `a day as YYYY-MM-DD, or ${UNKNOWN}`,
  read: (typed, context) =>
    typed === UNKNOWN || 'value' in day.read(typed, context)
      ? accepted(typed)
      : refused(`not a day; a day is YYYY-MM-DD, as 2025-06-30, or ${UNKNOWN}`),
};

// When a milestone happened, in the three forms the registry's milestones use: a month, a year or a quarter.
export const period: AnswerType = {
  shape: 'a month as YYYY-MM, a year as YYYY, or a quarter as YYYY-Q1',
  read: (typed) =>
    /^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/.test(typed)
      ? accepted(typed)
      : refused('not a month, a year or a quarter, as 2025-08, 2025 or 2025-Q3'),
};
