/**
 * review: a dated review event on an asset, suspicious or cleared; a suspicious outcome needs its reason.
 * @dev review: src/cli/eventCommand.ts
 */
import { defineEventCommand } from '../eventCommand';
import { targetRow, targetSlugs } from '../targetRow';
import { today } from '../writeCommand';

export const review = defineEventCommand({
  name: 'review',
  description: "record a review of an asset's data, suspicious or cleared, with a dated event",
  kind: 'review',
  fields: [
    {
      flag: '<asset>',
      description: 'the asset reviewed',
      label: 'asset',
      question: 'Which asset did you review?',
      required: true,
      choices: (registry) => targetSlugs(registry, 'asset'),
    },
    {
      flag: '--outcome <outcome>',
      description: 'suspicious or cleared',
      label: 'outcome',
      question: 'What did the review find?',
      required: true,
      choices: () => ['suspicious', 'cleared'],
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
      hint: 'Enter for today',
      date: true,
      fallback: () => today(),
    },
  ],
  target: (args, registry) => targetRow(registry, 'asset', args[0]!),
  event: (values) => ({
    outcome: values.outcome,
    reason: values.reason,
    ...(values.reviewer ? { note: `reviewed by ${values.reviewer}` } : {}),
  }),
});
