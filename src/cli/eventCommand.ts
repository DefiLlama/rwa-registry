/**
 * defineEventCommand: a command that appends one dated event to its target's file, the source in its links, after its own state rule; the write sets the flags from the events.
 * @dev review: src/cli/writeCommand.ts, then src/cli/commands/delist.ts
 */
import { join } from 'node:path';
import { FlagFormatError, RowStateError } from '../errors/cli';
import { targetKey } from '../registry/keys';
import { FLAG_EVENT_KINDS } from '../registry/reviewFlags';
import type { Registry, Row } from '../schema';
import type { CliCommand } from './index';
import { TARGETS, targetRow, targetSlugs, type TargetRow } from './targetRow';
import { defineWriteCommand, today, type Field, type FlagValues } from './writeCommand';

type Event = Row<'event'>;

export interface EventSpec {
  name: string;
  description: string;
  kind: string;
  // In the order they are asked, the target's <name> arguments first.
  fields?: Field[];
  target?: (args: string[], registry: Registry) => TargetRow;
  // A message when the target's events forbid this one, such as a second pause.
  state?: (events: Event[], values: FlagValues) => string | null;
  event?: (values: FlagValues) => Record<string, unknown>;
  change?: (file: Record<string, unknown>, target: TargetRow) => Record<string, unknown>;
}

// The target and its slug, asked as "Which market do you want to pause?", the form every event command takes.
export const targetFields = (name: string): Field[] => [
  {
    flag: '<target>',
    description: 'what it names',
    label: 'kind',
    question: `What do you want to ${name}?`,
    required: true,
    choices: () => TARGETS,
  },
  {
    flag: '<slug>',
    description: 'its slug, a market as venue:symbol',
    label: 'which one',
    question: (values) => `Which ${String(values.target)} do you want to ${name}?`,
    example: 'xyz:tsla',
    required: true,
    choices: (registry, values) => targetSlugs(registry, String(values.target)),
  },
];

const fieldsOf = (name: string): Field[] => [
  ...targetFields(name),
  {
    flag: '--at <date>',
    description: 'the day it happened, YYYY-MM-DD',
    label: 'day',
    question: 'On which day did it happen?',
    required: true,
    date: true,
    derive: () => ({ value: today(), why: 'today' }),
  },
  {
    flag: '--reason <text>',
    description: 'why, in one sentence',
    label: 'reason',
    question: 'Why, in one sentence?',
    example: 'the venue halted trading in the market',
    required: true,
  },
  {
    flag: '--source <url>',
    description: 'the page or API answer that shows it',
    label: 'source',
    question: 'Which page or API answer shows it?',
    example: 'https://status.example.com/incidents/1',
    required: true,
  },
];

export const defineEventCommand = (spec: EventSpec): CliCommand =>
  defineWriteCommand({
    name: spec.name,
    description: spec.description,
    every: true,
    fields: spec.fields ?? fieldsOf(spec.name),
    files: (values, registry, { args, root, read }) => {
      const target = (spec.target ?? ((given, rows) => targetRow(rows, given[0]!, given[1]!)))(args, registry);
      const events = registry.event.filter(
        (event) => targetKey(event.target) === targetKey({ table: target.table, key: target.key }),
      );
      const refuse = (message: string) =>
        new RowStateError({ file: join(root, target.file), message: `${target.key} ${message}` });
      const day = String(values.at);
      if (day > today()) throw new FlagFormatError({ file: spec.name, message: `--at ${day} is after today` });
      const refusal = spec.state?.(events, values);
      if (refusal) throw refuse(refusal);
      // An event before a later one of its flag's kinds would not be the latest, so its flag would not change.
      const group = Object.values(FLAG_EVENT_KINDS).find((kinds) => kinds.includes(spec.kind)) ?? [];
      const later = events.find((event) => group.includes(event.kind) && (event.date == null || event.date > day));
      if (later)
        throw refuse(
          `has a later ${later.kind} event, dated ${later.date ?? 'on an unknown day'}; --at must not be before it`,
        );
      const file = read(target.file) as Record<string, unknown>;
      const event = {
        kind: spec.kind,
        date: values.at,
        ...(spec.event?.(values) ?? { reason: values.reason }),
        links: [values.source],
      };
      const changed = spec.change?.(file, target) ?? file;
      const content = { ...changed, events: [...((changed.events as unknown[]) ?? []), event] };
      return [{ path: target.file, content, replaces: true }];
    },
  });
