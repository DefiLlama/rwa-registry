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
      required: true,
      choices: (registry) => targetSlugs(registry, 'asset'),
    },
    {
      flag: '--outcome <outcome>',
      description: 'suspicious or cleared',
      required: true,
      choices: () => ['suspicious', 'cleared'],
    },
    {
      flag: '--reason <text>',
      description: 'what is wrong, required when suspicious',
      required: (values) => values.outcome === 'suspicious',
    },
    { flag: '--source <url>', description: 'the page or API answer the review read', required: true },
    { flag: '--reviewer <handle>', description: 'who reviewed it' },
    {
      flag: '--at <date>',
      description: 'the day of the review, today by default',
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
