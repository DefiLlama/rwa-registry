/**
 * review: a dated review event on an asset, market, venue or platform, suspicious or cleared, from which its suspicious flag follows; a suspicious outcome needs its reason.
 * @dev review: src/cli/eventCommand.ts
 */
import { reviewFlagsOf } from '../../registry/reviewFlags';
import { reviewOutcome } from '../../schema/enums';
import { day } from '../answers/days';
import { link } from '../answers/links';
import { oneOf } from '../answers/picks';
import { defineEventCommand, targetFields } from '../eventCommand';
import { today } from '../writeCommand';

export const review = defineEventCommand({
  name: 'review',
  description: 'record a review of an asset, market, venue or platform: set suspicious and add a dated review event',
  kind: 'review',
  fields: [
    ...targetFields('review'),
    {
      flag: '--outcome <outcome>',
      description: 'suspicious or cleared',
      label: 'outcome',
      question: 'What did the review find?',
      required: true,
      answer: oneOf(reviewOutcome.options),
    },
    {
      flag: '--reason <text>',
      description: 'what is wrong, required when suspicious',
      label: 'reason',
      question: 'What is wrong with its data?',
      example: 'the supply on Ethereum doubled in one day with no mint event',
      required: (values) => values.outcome === 'suspicious',
    },
    {
      flag: '--source <url>',
      description: 'the page or API answer the review read',
      label: 'source',
      question: 'Which page or API answer did the review read?',
      example: 'https://etherscan.io/token/0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0',
      required: true,
      answer: link,
    },
    {
      flag: '--reviewer <handle>',
      description: 'who reviewed it',
      label: 'reviewer',
      question: 'Who reviewed it?',
      example: 'icellama',
    },
    {
      flag: '--at <date>',
      description: 'the day of the review, today by default',
      label: 'day',
      question: 'On which day was the review?',
      answer: day,
      fallback: () => today(),
    },
  ],
  // A second suspicious review would change nothing; a cleared one is a check worth recording at any time.
  state: (events, values) =>
    values.outcome === 'suspicious' && reviewFlagsOf(events).suspicious ? 'is already suspicious' : null,
  event: (values) => ({
    outcome: values.outcome,
    reason: values.reason,
    ...(values.reviewer ? { note: `reviewed by ${values.reviewer}` } : {}),
  }),
});
