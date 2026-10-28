/**
 * merge: one organization or underlying folded into another: references moved, drop's name kept, a merge event on keep, drop's file removed.
 * @dev review: src/registry/moveReferences.ts, src/cli/writeCommand.ts
 */
import { join } from 'node:path';
import { FlagFormatError, LegacyIdError, NoSuchRowError } from '../../errors/cli';
import { fileOf, moveReferences } from '../../registry';
import { homeOf } from '../../registry/layout';
import { blockNames, TABLE_NAMES, toFile, toRow, type Registry, type TableName } from '../../schema';
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
  arguments: '<table> <keep> <drop>',
  fields: [
    { flag: '--reason <text>', description: 'why the two rows are one', required: true },
    { flag: '--source <url>', description: 'the page that shows they are one', required: true },
    { flag: '--at <date>', description: 'the day of the merge, today by default', fallback: () => today() },
    { flag: '--force', description: 'merge although a row holds a legacy id the app keys on' },
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
    const others: FileToWrite[] = referencing(registry, drop, [kept.file, dropped.file]).flatMap((file) => {
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
    const aliases = [...new Set([...list(keepJson.aliases), name, ...list(dropJson.aliases)])].filter(
      (alias) => alias !== keepJson.name,
    );
    const identifiers = [...list(keepJson.identifiers), ...list(dropJson.identifiers)];
    const content: Json = {
      ...keepJson,
      ...(table === 'underlying' ? { aliases } : {}),
      ...(identifiers.length ? { identifiers } : {}),
      ...(list(keepJson.roles).length + list(dropJson.roles).length
        ? { roles: [...list(keepJson.roles), ...list(dropJson.roles)] }
        : {}),
      events: [...list(keepJson.events), ...list(dropJson.events), event],
    };
    return [
      ...others,
      { path: kept.file, content: toFile(table as TableName, content), replaces: true },
      { path: dropped.file, remove: true },
    ];
  },
});
