import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { commands } from '../../src/cli';
import type { AddField } from '../../src/cli/addCommand';
import { optionKey } from '../../src/cli/questionnaire';
import { blockFields, tables, type TableName } from '../../src/schema';
import type { AnyTableDefinition, VocabularyTypes } from '../../src/schema/defineTable';

const ANY_VOCABULARY = new Proxy({}, { get: () => z.string() }) as VocabularyTypes;

// What the schema lets a file hold: its fields but the ones the build computes, the blocks the command's kind leaves out, and the nested lists the command sets.
const writable = (table: TableName, children: string[], omits: string[] = []) => {
  const definition = tables[table] as AnyTableDefinition;
  const left = new Set([...(definition.build ?? []), ...omits.flatMap((block) => blockFields(table, block))]);
  return [...Object.keys(definition.fields(ANY_VOCABULARY)).filter((field) => !left.has(field)), ...children];
};

// Each add command, its table, the nested lists it sets, and the fields it fills itself and never asks.
const CASES: { name: string; table: TableName; children: string[]; omits?: string[]; derived: string[] }[] = [
  {
    name: 'add asset',
    table: 'asset',
    children: ['deployments', 'roles'],
    derived: ['slug', 'legacyId', 'canonicalMarketId', 'activeAumReviewed', 'suspicious', 'delisted'],
  },
  {
    name: 'add platform',
    table: 'organization',
    children: [],
    derived: ['kind', 'slug', 'legacyPid', 'suspicious', 'delisted'],
  },
  {
    name: 'add organization',
    table: 'organization',
    children: [],
    omits: ['platform', 'review'],
    derived: ['slug', 'legacyPid'],
  },
  { name: 'add venue', table: 'venue', children: [], derived: ['slug', 'suspicious', 'delisted'] },
  {
    name: 'add market',
    table: 'perp_market',
    children: ['roles', 'events'],
    derived: ['legacyId', 'suspicious', 'delisted'],
  },
  { name: 'add underlying', table: 'underlying', children: [], derived: ['slug', 'class'] },
  { name: 'add value', table: 'vocabulary', children: [], derived: ['slug'] },
];

const rowKey = (field: AddField) => field.path?.[0] ?? field.row ?? optionKey(field.flag);

describe('the add questionnaires', () => {
  it('cover every add command', () => {
    const adds = commands.filter((command) => command.name.startsWith('add ')).map((command) => command.name);

    expect(CASES.map(({ name }) => name).sort()).toEqual(adds.sort());
  });

  it.each(CASES)('$name asks every field the schema lets its file hold, but the ones it fills itself', (run) => {
    const command = commands.find((item) => item.name === run.name)!;
    const expected = writable(run.table, run.children, run.omits).filter((field) => !run.derived.includes(field));
    const known = new Set(writable(run.table, run.children));

    const asked = new Set(
      (command.questions as AddField[]).map(rowKey).filter((field) => known.has(field) && !run.derived.includes(field)),
    );

    expect([...asked].sort()).toEqual([...new Set(expected)].sort());
  });

  it.each(CASES)('$name asks no question with no flag for a field it fills itself', (run) => {
    const command = commands.find((item) => item.name === run.name)!;

    const asked = (command.questions as AddField[]).filter((field) => field.askedOnly).map(rowKey);

    expect(asked.filter((field) => run.derived.includes(field))).toEqual([]);
  });

  it.each(CASES)('$name asks the required fields first, then the optional ones', (run) => {
    const command = commands.find((item) => item.name === run.name)!;
    const asked = (command.questions as AddField[]).filter((field) => field.asked?.({}) !== false);
    const leading = (field: AddField) =>
      field.lead === true || (typeof field.required === 'function' ? field.required({}) : field.required === true);

    const firstOptional = asked.findIndex((field) => !leading(field));

    expect(
      asked
        .slice(firstOptional)
        .filter(leading)
        .map((field) => field.flag),
    ).toEqual([]);
  });
});
