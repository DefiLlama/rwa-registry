/**
 * apply: one batch csv of patch rows landed through set, merge and ack, with the held rows and counts under --out.
 * @dev review: src/migrate/applyBatch.ts
 */
import { dirname, join } from 'node:path';
import { applyBatch } from '../../migrate/applyBatch';
import type { CliCommand } from '../index';
import { REGISTRY_FLAG, registryOf } from '../registryFlag';

export const apply: CliCommand = {
  name: 'apply',
  description: 'land one batch csv through set, merge, ack and, for its export rows, the add commands, every check on',
  flags: [
    { spec: '--batch <csv>', description: 'the batch: file,path,old,new,source,fetchedAt,agent,verified' },
    { spec: '--markets <csv>', description: "the markets export the batch's export:<id> rows are cells of" },
    { spec: '--platforms <csv>', description: "the Platforms export the batch's export:PID <n> rows are cells of" },
    { spec: '--out <dir>', description: 'where apply-<batch>.md and held-<batch>.csv go, migrate-out by default' },
    {
      spec: '--patches <dir>',
      description: 'the folder of patch csv files the source rows go to, patches/ beside the registry by default',
    },
    { spec: '--dry-run', description: 'land the batch in memory and write only the report' },
    REGISTRY_FLAG,
  ],
  run: async ({ batch, markets, platforms, out, patches, dryRun, registry }, { print }) => {
    if (typeof batch !== 'string' || (typeof markets === 'string') !== (typeof platforms === 'string')) {
      print('apply needs --batch, and --markets with --platforms or neither');
      return 1;
    }
    const root = registryOf(registry);
    const result = await applyBatch({
      batch,
      root,
      out: typeof out === 'string' ? out : 'migrate-out',
      dryRun: dryRun === true,
      patchDir: typeof patches === 'string' ? patches : join(dirname(root), 'patches'),
      exports: typeof markets === 'string' ? { markets, platforms: String(platforms) } : null,
    });
    print(
      `${batch}: ${result.added} ${dryRun === true ? 'would land' : 'landed'}, ${result.present} in place already, ${result.held} held; report in ${result.report}`,
    );
    return 0;
  },
};
