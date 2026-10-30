/**
 * ack: one guard exception, acks/<kind>/<slug>.json, with the fields its kind names and a slug from its target.
 * @dev review: src/cli/writeCommand.ts, src/schema/ack.ts, docs/acks.md
 */
import { FlagFormatError } from '../../errors/cli';
import { homeFile, rowSlug } from '../../registry';
import { toFile, type Registry } from '../../schema';
import { ACK_KIND_FIELDS, isRequiredAckField, type AckField } from '../../schema/ack';
import { ACK_KINDS, type AckKind } from '../../schema/enums';
import type { CliCommand } from '../index';
import { targetRow, targetSlugs } from '../targetRow';
import {
  ASKS,
  defineWriteCommand,
  optionKey,
  today,
  type Field,
  type FlagValue,
  type FlagValues,
} from '../writeCommand';

const usd = (flag: string, text: string): number => {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value) || value < 0) {
    throw new FlagFormatError({ file: flag, message: `${text} is not a USD amount` });
  }
  return value;
};

const range = (flag: string, text: string): number[] => {
  const parts = text.split(':');
  if (parts.length !== 2)
    throw new FlagFormatError({ file: flag, message: `${text} is not a range; give <low>:<high>` });
  return parts.map((part) => usd(flag, part));
};

interface FlagSpec extends Field {
  read?: (flag: string, text: string) => unknown;
}

// The flag that fills each field a kind may hold beside its target, in the order they are asked: the band, the days, the life.
const FLAGS: Partial<Record<AckField, FlagSpec>> = {
  metrics: {
    flag: '--metrics <list>',
    description: 'onChainMcap, activeMcap or both',
    list: true,
    choices: () => ['onChainMcap', 'activeMcap'],
  },
  direction: { flag: '--direction <direction>', description: 'up or down', choices: () => ['up', 'down'] },
  maxCurrentUsd: { flag: '--max-current <usd>', description: 'the most the blocked value may be', read: usd },
  minPreviousUsd: { flag: '--min-previous <usd>', description: 'the least the last good value may be', read: usd },
  currentUsd: { flag: '--current <low:high>', description: 'the verified value a release lets through', read: range },
  previousUsd: { flag: '--previous <low:high>', description: 'the frozen value a release is aimed at', read: range },
  maxValueUsd: { flag: '--max-value <usd>', description: 'the most a single-point value may be', read: usd },
  day: { flag: '--day <date>', description: 'the series day it covers, for aggregate-jump and head-move', date: true },
  firstDay: { flag: '--first-day <date>', description: 'the first series day a drift ack covers', date: true },
  lastDay: { flag: '--last-day <date>', description: 'the last series day a drift ack covers', date: true },
  from: { flag: '--from <date>', description: 'the first day the ack holds, YYYY-MM-DD, today by default', date: true },
  until: {
    flag: '--until <date>',
    description: 'the last day it holds; left out, it holds until the resolve step is done',
    date: true,
  },
};

const flagOf = (field: AckField) => FLAGS[field]!.flag.split(' ')[0]!;

// The band of every asset-move ack on the server's master: a drop to about 0 USD from at least 100k USD.
const DROP_TO_ZERO: Partial<Record<AckField, unknown>> = {
  metrics: ['onChainMcap', 'activeMcap'],
  direction: 'down',
  maxCurrentUsd: 1000,
  minPreviousUsd: 100_000,
};

const fallbackOf = (kind: AckKind, field: AckField): unknown =>
  field === 'from' ? today() : field === 'until' ? null : kind === 'asset-move' ? DROP_TO_ZERO[field] : undefined;

// The fields of the kind the answers name, none for a kind that is not one.
const fieldsOf = (values: FlagValues): AckField[] => {
  const kind = String(values.kind) as AckKind;
  return ACK_KINDS.includes(kind) ? ACK_KIND_FIELDS[kind] : [];
};

// A kind's own field is asked, required unless it has a default, and offers that default.
const asked = (field: AckField, spec: FlagSpec): FlagSpec => ({
  ...spec,
  asked: (values) => fieldsOf(values).includes(field),
  required: (values) =>
    fieldsOf(values).includes(field) &&
    isRequiredAckField(field) &&
    fallbackOf(values.kind as AckKind, field) === undefined,
  derive: (values) => {
    const offered = fieldsOf(values).includes(field) ? fallbackOf(values.kind as AckKind, field) : undefined;
    if (offered == null) return undefined;
    return { value: Array.isArray(offered) ? offered.map(String) : String(offered) };
  },
});

const HINTS: Partial<Record<AckField, string>> = {
  asset: 'an asset slug',
  venue: 'a venue slug',
  series: '<dimension>/<key>, or * for every series',
  contract: '<venue>:<symbol>',
};

const TARGETS: Partial<Record<AckField, (registry: Registry, given: string) => string>> = {
  asset: (registry, given) => targetRow(registry, 'asset', given).key,
  venue: (registry, given) => targetRow(registry, 'venue', given).key,
  series: (_registry, given) => given,
  contract: (_registry, given) => given.toLowerCase(),
};

const help = [
  'Kinds, the target each names, and the flags it takes beside --reason and --resolve (docs/acks.md):',
  ...ACK_KINDS.map((kind) => {
    const [target, ...rest] = ACK_KIND_FIELDS[kind];
    return `  ${`${kind} <${target}>`.padEnd(36)}${rest.map(flagOf).join(' ')}`;
  }),
  'An asset-move ack left without its band takes the band of every master ack: --metrics onChainMcap,activeMcap',
  '--direction down --max-current 1000 --min-previous 100000.',
].join('\n');

const command = defineWriteCommand({
  name: 'ack',
  description: 'add one guard exception of a kind, with its reason and resolve step, open-ended without --until',
  arguments: '<kind> <target>',
  every: true,
  fields: [
    { flag: '<kind>', description: 'the ack kind', required: true, choices: () => [...ACK_KINDS] },
    {
      flag: '<target>',
      description: 'what it covers',
      required: true,
      choices: (registry, values) => {
        const [target] = fieldsOf(values);
        return target === 'asset' || target === 'venue' ? targetSlugs(registry, target) : [];
      },
      derive: (values) => {
        const [target] = fieldsOf(values);
        return target ? { why: HINTS[target] } : undefined;
      },
    },
    {
      flag: '--reason <text>',
      description: 'what the guard flags and why it is fine, naming the evidence',
      required: true,
    },
    { flag: '--resolve <text>', description: 'the step that ends the exception', required: true },
    ...(Object.entries(FLAGS) as [AckField, FlagSpec][]).map(([field, spec]) => asked(field, spec)),
  ],
  files: (values, registry, { args }) => {
    const [kind, given] = args as [AckKind, string];
    if (!ACK_KINDS.includes(kind)) {
      throw new FlagFormatError({ file: kind, message: `is not an ack kind; use ${ACK_KINDS.join(', ')}` });
    }
    const [target, ...fields] = ACK_KIND_FIELDS[kind];
    const stray = (Object.keys(FLAGS) as AckField[]).filter(
      (field) => !fields.includes(field) && values[optionKey(FLAGS[field]!.flag)] !== undefined,
    );
    if (stray.length) {
      const message = `${stray.map(flagOf).join(', ')} ${stray.length > 1 ? 'are not flags' : 'is not a flag'} of ${kind} acks`;
      throw new FlagFormatError({ file: 'ack', message });
    }
    const row: Record<string, unknown> = { kind, [target]: TARGETS[target]!(registry, given) };
    for (const field of fields) {
      const value: FlagValue | undefined = values[optionKey(FLAGS[field]!.flag)];
      const read = FLAGS[field]!.read;
      row[field] = value === undefined ? fallbackOf(kind, field) : read ? read(flagOf(field), String(value)) : value;
    }
    const named = String(row[target]);
    const slug = [named === '*' ? 'every-series' : rowSlug(named), row.day ?? row.firstDay].filter(Boolean).join('-');
    const content = toFile('ack', { slug, ...row, reason: values.reason, resolve: values.resolve });
    return [{ path: homeFile('ack', { kind, slug }), content }];
  },
});

export const ack: CliCommand = { ...command, help: `${ASKS}\n\n${help}` };
