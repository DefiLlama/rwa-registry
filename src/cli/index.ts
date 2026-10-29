#!/usr/bin/env node
/**
 * defillama-rwa: one command per file in src/cli/commands/, registered below one line each; commander parses.
 * @dev review: src/cli/commands/validate.ts
 */
import { Command } from 'commander';
import type { Ask } from './ask';
import { ack } from './commands/ack';
import { addAsset } from './commands/add-asset';
import { addChain } from './commands/add-chain';
import { addMarket } from './commands/add-market';
import { addOrganization } from './commands/add-organization';
import { addPlatform } from './commands/add-platform';
import { addRule } from './commands/add-rule';
import { addUnderlying } from './commands/add-underlying';
import { addValue } from './commands/add-value';
import { addVenue } from './commands/add-venue';
import { build } from './commands/build';
import { delist } from './commands/delist';
import { discover } from './commands/discover';
import { merge } from './commands/merge';
import { pause } from './commands/pause';
import { resume } from './commands/resume';
import { review } from './commands/review';
import { schema } from './commands/schema';
import { set } from './commands/set';
import { validate } from './commands/validate';

export interface CliDeps {
  print: (line: string) => void;
  ask?: Ask;
}

export interface CliCommand {
  name: string;
  description: string;
  arguments?: string;
  help?: string;
  flags: { spec: string; description: string }[];
  run: (args: { args: string[] } & Record<string, unknown>, deps: CliDeps) => Promise<number>;
}

const commands: CliCommand[] = [
  validate,
  build,
  schema,
  addAsset,
  addPlatform,
  addVenue,
  addMarket,
  addOrganization,
  addChain,
  addUnderlying,
  addValue,
  addRule,
  delist,
  pause,
  resume,
  review,
  ack,
  set,
  merge,
  discover,
];

const GROUPS: Record<string, string> = {
  add: 'add one row to the registry files',
};

const commandOf = (program: Command, name: string): Command => {
  const [group, leaf] = name.split(' ');
  if (!leaf) return program.command(group);
  const parent =
    program.commands.find((command) => command.name() === group) ?? program.command(group).description(GROUPS[group]);
  return parent.command(leaf);
};

export const main = async (argv: string[], deps: CliDeps): Promise<number> => {
  let code = 0;
  const program = new Command('defillama-rwa')
    .exitOverride()
    .configureOutput({ writeOut: (text) => text.trimEnd().split('\n').forEach(deps.print) });
  for (const command of commands) {
    const sub = commandOf(program, command.name).description(command.description);
    if (command.arguments) sub.arguments(command.arguments);
    if (command.help) sub.addHelpText('after', `\n${command.help}`);
    for (const flag of command.flags) sub.option(flag.spec, flag.description);
    sub.action(async function (this: Command) {
      code = await command.run({ ...this.opts(), args: this.args }, deps);
    });
  }
  await program.parseAsync(argv, { from: 'user' });
  return code;
};

if (require.main === module) {
  main(process.argv.slice(2), { print: (line) => console.log(line) })
    .then((code) => (process.exitCode = code))
    .catch((error: { exitCode?: number; message?: string }) => {
      if (error.exitCode === undefined) console.error(error.message);
      process.exitCode = error.exitCode ?? 1;
    });
}
