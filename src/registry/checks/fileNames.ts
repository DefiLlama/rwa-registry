/**
 * fileNames: each row sits in the file its key names, as layout builds it; a market in perps/<venue>/<lowercase symbol>.json, a venue operator beside a venue that names it.
 * @dev review: src/registry/layout.ts
 */
import { FileNameError } from '../../errors';
import type { Registry } from '../../schema';
import { rowsOf } from '../keys';
import { FILE_TABLES, homeFile } from '../layout';
import { fileOf } from '../place';
import { report, type Problem } from '../problem';

export const fileNames = (registry: Registry): Problem[] => {
  const venuesOf = (organization: unknown) =>
    registry.venue.filter((venue) => venue.organization === organization).map((venue) => venue.slug);
  return FILE_TABLES.flatMap((table) =>
    rowsOf(registry, table).flatMap((row) => {
      const file = fileOf(row);
      const expected =
        table === 'organization' && row.kind === 'venue-operator'
          ? venuesOf(row.slug).map((venue) => homeFile(table, { ...row, venue }))
          : [homeFile(table, row)];
      if (file === null || expected.includes(file)) return [];
      const home = expected.length ? `belongs in ${expected.join(' or ')}` : 'is a venue operator no venue names';
      return [report(FileNameError, table, row, '', `${file} holds a row that ${home}`)];
    }),
  );
};
