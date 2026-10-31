/**
 * merge: one organization or underlying folded into another: references moved, drop's name kept in a merge event on keep, drop's file removed, a dropped platform's assets moved into keep's folder.
 * @dev review: src/registry/moveReferences.ts, src/cli/writeCommand.ts
 */
import { join } from 'node:path';
import { FlagFormatError, LegacyIdError, NoSuchRowError } from '../../errors/cli';
import { fileOf, moveReferences } from '../../registry';
import { homeFile, homeOf } from '../../registry/layout';
import { blockNames, TABLE_NAMES, toFile, toRow, type Registry, type TableName } from '../../schema';
import { day } from '../answers/days';
import { link } from '../answers/links';
import { oneOf } from '../answers/picks';
import type { FileToWrite } from '../writeCommand';
import { defineWriteCommand, today } from '../writeCommand';

const MERGEABLE = ['organization', 'underlying'] as const;
type Mergeable = (typeof MERGEABLE)[number];
type Json = Record<string, unknown>;

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const rowOf = (registry: Registry, table: Mergeable, slug: string) => {
  const row = (registry[table] as Json[]).find((candidate) => candidate.slug === slug);
  const file = row && fileOf(row);
  if (!row || !file) throw new NoSuchRowError({ file: slug, message: `no ${table} ${slug} in the registry` });
  return { row, file };
};

// The slugs of a mergeable table, sorted; none for another table.
const slugsOf = (registry: Registry, table: unknown): string[] =>
  MERGEABLE.includes(table as Mergeable)
    ? (registry[table as Mergeable] as Json[]).map((row) => String(row.slug)).sort()
    : [];

// The files of every row whose fields name drop, read and moved; keep's and drop's own files are built apart.
const referencing = (registry: Registry, drop: string, skip: string[]) => {
  const needle = `"${drop}"`;
  const files = new Set<string>();
  for (const table of TABLE_NAMES)
    for (const row of registry[table] as object[]) {
      const file = fileOf(row);
      if (file && !skip.includes(file) && JSON.stringify(row).includes(needle)) files.add(file);
    }
  return [...files].sort();
};

export const merge = defineWriteCommand({
  name: 'merge',
  description: 'merge one organization or underlying into another and remove the dropped file',
  every: true,
  fields: [
    {
      flag: '<table>',
      description: 'the table of the two rows',
      label: 'table',
      question: 'Do you merge two organizations or two underlyings?',
      required: true,
      answer: oneOf(MERGEABLE),
    },
    {
      flag: '<keep>',
      description: 'the row that stays',
      label: 'kept',
      question: 'Which one stays?',
      required: true,
      answer: oneOf(({ registry, values }) => slugsOf(registry, values.table)),
    },
    {
      flag: '<drop>',
      description: 'the row folded into it and removed',
      label: 'dropped',
      question: 'Which one is folded into it and removed?',
      required: true,
      answer: oneOf(({ registry, values }) => slugsOf(registry, values.table).filter((slug) => slug !== values.keep)),
    },
    {
      flag: '--reason <text>',
      description: 'why the two rows are one',
      label: 'reason',
      question: 'Why are the two one, in one sentence?',
      example: 'both name the same Jersey company',
      required: true,
    },
    {
      flag: '--source <url>',
      description: 'the page that shows they are one',
      label: 'source',
      question: 'Which page shows they are one?',
      example: 'https://find-and-update.company-information.service.gov.uk/company/1',
      required: true,
      answer: link,
    },
    {
      flag: '--at <date>',
      description: 'the day of the merge, today by default',
      label: 'day',
      question: 'On which day was the merge?',
      answer: day,
      fallback: () => today(),
    },
    {
      flag: '--force',
      description: 'merge although a row holds a legacy id the app keys on',
      label: 'force',
      question: 'Merge even when a row holds a legacy id the app keys on?',
    },
  ],
  files: (values, registry, { args, root, read }) => {
    const [table, keep, drop] = args as [string, string, string];
    if (!MERGEABLE.includes(table as Mergeable) || keep === drop) {
      throw new FlagFormatError({ file: 'merge', message: 'merges organization or underlying, two different slugs' });
    }
    const kept = rowOf(registry, table as Mergeable, keep);
    const dropped = rowOf(registry, table as Mergeable, drop);
    const legacy = [kept.row, dropped.row].find((row) => row.legacyPid != null);
    if (legacy && values.force !== true) {
      const message = `${legacy.slug} holds legacyPid ${legacy.legacyPid}, which the app keys on; pass --force with the reason to merge anyway`;
      throw new LegacyIdError({ file: join(root, fileOf(legacy)!), message });
    }
    // A file in named blocks is moved as its row and written back in its blocks.
    const move = (file: string, json: unknown) => {
      const home = homeOf(file)!.table;
      if (!blockNames(home).length || Array.isArray(json))
        return moveReferences(home, json, table as TableName, drop, keep) as Json;
      return toFile(home, moveReferences(home, toRow(home, json as Json), table as TableName, drop, keep) as Json);
    };
    // A platform's assets sit in its folder, so a dropped platform's asset files move into the kept platform's folder.
    const platforms = table === 'organization' && kept.row.kind === 'platform' && dropped.row.kind === 'platform';
    const assets = platforms ? registry.asset.filter((asset) => asset.platform === drop) : [];
    const moved: FileToWrite[] = assets.flatMap((asset) => {
      const file = fileOf(asset)!;
      const path = homeFile('asset', { ...asset, platform: keep });
      return [
        { path, content: move(file, read(file)) },
        { path: file, remove: true },
      ];
    });
    const skip = [kept.file, dropped.file, ...assets.map((asset) => fileOf(asset)!)];
    const others: FileToWrite[] = referencing(registry, drop, skip).flatMap((file) => {
      const before = read(file);
      const content = move(file, before);
      return JSON.stringify(content) === JSON.stringify(before) ? [] : [{ path: file, content, replaces: true }];
    });
    const keepJson = toRow(table as TableName, move(kept.file, read(kept.file)));
    const dropJson = toRow(table as TableName, move(dropped.file, read(dropped.file)));
    const name = String(dropJson.name);
    const event = {
      kind: 'merge',
      date: values.at,
      reason: values.reason,
      note: `merged ${drop} (${name})`,
      links: [values.source],
    };
    const identifiers = [...list(keepJson.identifiers), ...list(dropJson.identifiers)];
    const content: Json = {
      ...keepJson,
      ...(identifiers.length ? { identifiers } : {}),
      ...(list(keepJson.roles).length + list(dropJson.roles).length
        ? { roles: [...list(keepJson.roles), ...list(dropJson.roles)] }
        : {}),
      events: [...list(keepJson.events), ...list(dropJson.events), event],
    };
    return [
      ...others,
      ...moved,
      { path: kept.file, content: toFile(table as TableName, content), replaces: true },
      { path: dropped.file, remove: true },
    ];
  },
});
