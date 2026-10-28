/**
 * migrate: one stage of the two Airtable exports landed through the add commands, with the held rows and counts under --out.
 * @dev review: src/migrate/migrateStage.ts
 */
import { dirname, join } from 'node:path';
import { migrateStage } from '../../migrate/migrateStage';
import { STAGES, type Stage } from '../../migrate/stages';
import type { CliCommand } from '../index';
import { REGISTRY_FLAG, registryOf } from '../registryFlag';

export const migrate: CliCommand = {
  name: 'migrate',
  description: 'land one stage of the Airtable exports through the add commands, every check on',
  flags: [
    { spec: '--markets <csv>', description: 'the markets export (rwa-Grid view.csv)' },
    { spec: '--platforms <csv>', description: 'the Platforms export (platforms-Grid view.csv)' },
    { spec: '--stage <name>', description: `one of ${STAGES.join(', ')}, in that order` },
    { spec: '--out <dir>', description: 'where migrate-<stage>.md and held-<stage>.csv go, migrate-out by default' },
    {
      spec: '--export-patches <path>',
      description: 'a batch csv or folder whose export:<id> rows and oracle map are applied over the exports first',
    },
    {
      spec: '--batches <dir>',
      description: 'the batches folder, whose oracle map and oracle firms are applied over the exports first',
    },
    {
      spec: '--from-registry <dir>',
      description: 'vocabularies stage: a registry whose vocabularies and category rules land too, the sheet folded in',
    },
    { spec: '--dry-run', description: 'land the stage in memory and write only the report' },
    REGISTRY_FLAG,
  ],
  run: async (
    { markets, platforms, stage, out, exportPatches, batches, fromRegistry, dryRun, registry },
    { print },
  ) => {
    if (typeof markets !== 'string' || typeof platforms !== 'string' || !STAGES.includes(stage as Stage)) {
      print(`migrate needs --markets, --platforms and --stage, one of ${STAGES.join(', ')}`);
      return 1;
    }
    if (typeof fromRegistry === 'string' && stage !== 'vocabularies') {
      print('--from-registry lands vocabularies and category rules, so it is given with --stage vocabularies only');
      return 1;
    }
    const root = registryOf(registry);
    const result = await migrateStage({
      markets,
      platforms,
      stage: stage as Stage,
      root,
      out: typeof out === 'string' ? out : 'migrate-out',
      dryRun: dryRun === true,
      exportPatches: typeof exportPatches === 'string' ? exportPatches : null,
      batches: typeof batches === 'string' ? batches : null,
      fromRegistry: typeof fromRegistry === 'string' ? fromRegistry : null,
      patchDir: join(dirname(root), 'patches'),
    });
    print(
      `${stage}: ${result.added} ${dryRun === true ? 'would be added' : 'added'}, ${result.present} already there, ${result.held} held; report in ${result.report}`,
    );
    return 0;
  },
};
