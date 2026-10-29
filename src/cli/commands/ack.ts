/**
 * ack: one guard exception file, acks/<asset>-<guard>.json at the repository root, beside registry/, in the ack shape.
 * An ack without --until is open-ended, written with until null, as the server's code lists hold theirs.
 * @dev review: src/cli/writeCommand.ts, src/schema/ack.ts
 */
import { homeFile } from '../../registry';
import { targetRow } from '../targetRow';
import { defineWriteCommand, today } from '../writeCommand';

// The suffix the acks in acks/ already use per guard.
const SUFFIX: Record<string, string> = { 'flows-hidden': 'flows', 'asset-move': 'asset-move' };

export const ack = defineWriteCommand({
  name: 'ack',
  description: 'add one guard exception for an asset, with its reason, resolve step and end date, or open-ended',
  arguments: '<asset>',
  fields: [
    {
      flag: '--guard <guard>',
      description: 'flows-hidden or asset-move',
      required: true,
      choices: () => Object.keys(SUFFIX),
    },
    {
      flag: '--until <date>',
      description: 'the last day the exception holds, YYYY-MM-DD; left out, it holds until the resolve step is done',
    },
    {
      flag: '--reason <text>',
      description: 'what the guard would flag and why it is fine, naming the page or API answer that shows it',
      required: true,
    },
    { flag: '--resolve <text>', description: 'the step that ends the exception', required: true },
    { flag: '--from <date>', description: 'the first day it holds, today by default', fallback: () => today() },
  ],
  files: (values, registry, { args }) => {
    const asset = targetRow(registry, 'asset', args[0]!).key;
    const slug = `${asset}-${SUFFIX[String(values.guard)] ?? values.guard}`;
    const content = {
      slug,
      guard: values.guard,
      asset,
      from: values.from,
      until: values.until ?? null,
      reason: values.reason,
      resolve: values.resolve,
    };
    return [{ path: homeFile('ack', { slug }), content }];
  },
});
