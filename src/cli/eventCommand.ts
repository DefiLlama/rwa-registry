/**
 * defineEventCommand: a command that appends one dated event to its target's file, the source in its links, after its own state rule.
 * @dev review: src/cli/writeCommand.ts, then src/cli/commands/delist.ts
 */
import { join } from 'node:path';
import { RowStateError } from '../errors/cli';
import { targetKey } from '../registry/keys';
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
  state?: (events: Event[]) => string | null;
  event?: (values: FlagValues) => Record<string, unknown>;
  change?: (file: Record<string, unknown>, target: TargetRow) => Record<string, unknown>;
}

const FIELDS: Field[] = [
  { flag: '<target>', description: 'what it names', required: true, choices: () => TARGETS },
  {
    flag: '<slug>',
    description: 'its slug, a market as venue:symbol',
    required: true,
    choices: (registry, values) => targetSlugs(registry, String(values.target)),
  },
  {
    flag: '--at <date>',
    description: 'the day it happened, YYYY-MM-DD',
    required: true,
    date: true,
    derive: () => ({ value: today(), why: 'today' }),
  },
  { flag: '--reason <text>', description: 'why, in one sentence', required: true },
  { flag: '--source <url>', description: 'the page or API answer that shows it', required: true },
];

export const defineEventCommand = (spec: EventSpec): CliCommand =>
  defineWriteCommand({
    name: spec.name,
    description: spec.description,
    every: true,
    fields: spec.fields ?? FIELDS,
    files: (values, registry, { args, root, read }) => {
      const target = (spec.target ?? ((given, rows) => targetRow(rows, given[0]!, given[1]!)))(args, registry);
      const events = registry.event.filter(
        (event) => targetKey(event.target) === targetKey({ table: target.table, key: target.key }),
      );
      const refusal = spec.state?.(events);
      if (refusal) throw new RowStateError({ file: join(root, target.file), message: `${target.key} ${refusal}` });
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
