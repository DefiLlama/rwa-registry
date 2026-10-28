/**
 * import: the two Airtable exports into the registry files plus the migration report.
 * @dev review: src/import/importExports.ts
 */
import { importExports } from '../../import/importExports';
import type { CliCommand } from '../index';
import { REGISTRY_FLAG, registryOf } from '../registryFlag';

export const importCommand: CliCommand = {
  name: 'import',
  description: 'import the Airtable exports into registry files and write the migration report',
  flags: [
    { spec: '--markets <csv>', description: 'the markets export (rwa-Grid view.csv)' },
    { spec: '--platforms <csv>', description: 'the Platforms export (platforms-Grid view.csv)' },
    { spec: '--out <dir>', description: 'where report.md, unmapped.csv, calls.md and held/ go' },
    REGISTRY_FLAG,
    {
      spec: '--patches <path>',
      description: 'a patch csv, or a folder of them, applied over the exports in name order',
    },
    { spec: '--dates <json>', description: 'first and last stored day per legacy id, from the daily tables' },
  ],
  run: async ({ markets, platforms, out, registry, patches, dates }, { print }) => {
    if (typeof markets !== 'string' || typeof platforms !== 'string' || typeof out !== 'string') {
      print('import needs --markets, --platforms and --out');
      return 1;
    }
    const report = importExports({
      markets,
      platforms,
      out,
      root: registryOf(registry),
      patches: typeof patches === 'string' ? patches : null,
      dates: typeof dates === 'string' ? dates : null,
    });
    const errors = report.problems.filter((problem) => problem.severity === 'error');
    print(
      `read ${report.rowsRead.markets} markets rows and ${report.rowsRead.platforms} Platforms rows in ${(report.runtimeMs / 1000).toFixed(1)} s`,
    );
    print(
      `files: ${report.written} written, ${report.unchanged} unchanged, ${report.removed} removed; ${report.unmapped.length} unmapped rows`,
    );
    print(
      `problems: ${errors.length} errors, ${report.problems.length - errors.length} warnings; report in ${out}/report.md`,
    );
    errors.slice(0, 20).forEach((problem) => print(`${problem.file}: ${problem.message}`));
    return errors.length ? 1 : 0;
  },
};
