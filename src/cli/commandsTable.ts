/**
 * commandsTable: the README's command table, read from the CLI's own --help so its flags cannot drift; `pnpm docs:commands` writes it between the two markers, and a test fails when the committed README differs.
 * @dev review: src/cli/index.ts, src/cli/writeCommand.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { main } from './index';

export const README = 'README.md';
const START = '<!-- commands:start, written by pnpm docs:commands from --help -->';
const END = '<!-- commands:end -->';
const PROGRAM = 'defillama-rwa';

interface Entry {
  term: string;
  description: string;
}

const helpOf = async (argv: string[]): Promise<string[]> => {
  const lines: string[] = [];
  await main([...argv, '--help'], { print: (line) => lines.push(line) }).catch((error: { code?: string }) => {
    if (error.code !== 'commander.helpDisplayed') throw error;
  });
  return lines;
};

// The entries of one section, such as Options:, each with its wrapped description joined back into one line.
const entriesOf = (lines: string[], header: string): Entry[] => {
  const start = lines.indexOf(header);
  if (start === -1) return [];
  const entries: Entry[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('  ')) break;
    const entry = /^ {2}(\S.*?)(?: {2,}(.*))?$/.exec(line);
    if (entry) entries.push({ term: entry[1]!, description: entry[2] ?? '' });
    else entries.at(-1)!.description += ` ${line.trim()}`;
  }
  return entries.map(({ term, description }) => ({ term, description: description.trim() }));
};

// The paragraph between the Usage line and the first section.
const descriptionOf = (lines: string[]) => {
  const end = lines.findIndex((line, i) => i > 1 && line === '');
  return lines
    .slice(2, end)
    .map((line) => line.trim())
    .join(' ');
};

const code = (text: string) => `\`${text}\``;
const cell = (text: string) => text.replace(/\|/g, '\\|');
const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

const rowOf = (lines: string[]): string => {
  const usage = lines[0]!.replace(`Usage: ${PROGRAM} `, '').replace(' [options]', '');
  const flags = entriesOf(lines, 'Options:').filter(({ term }) => term !== '-h, --help');
  const required = flags.filter(({ description }) => description.startsWith('required:'));
  const optional = flags.filter((flag) => !required.includes(flag));
  const list = (entries: Entry[]) => entries.map(({ term }) => code(term)).join(', ');
  return `| ${[code(usage), sentence(descriptionOf(lines)), list(required), list(optional)].map(cell).join(' | ')} |`;
};

// Every command and sub-command in the order --help lists them; a group such as add gives one row per sub-command.
const rowsOf = async (path: string[]): Promise<string[]> => {
  const lines = await helpOf(path);
  const commands = entriesOf(lines, 'Commands:')
    .map(({ term }) => term.split(' ')[0]!)
    .filter((name) => name !== 'help');
  if (!commands.length) return [rowOf(lines)];
  const rows: string[] = [];
  for (const name of commands) rows.push(...(await rowsOf([...path, name])));
  return rows;
};

export const commandsTable = async (): Promise<string> =>
  ['| Command | Does | Required flags | Other flags |', '| --- | --- | --- | --- |', ...(await rowsOf([]))].join('\n');

// The README with the table between the markers replaced, formatted as `pnpm format` would.
export const readmeWithTable = async (readme: string): Promise<string> => {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end < start) throw new Error(`${README} needs the markers ${START} and ${END}`);
  const text = `${readme.slice(0, start + START.length)}\n\n${await commandsTable()}\n\n${readme.slice(end)}`;
  return format(text, { ...(await resolveConfig(README)), filepath: README });
};

if (require.main === module) {
  readmeWithTable(readFileSync(README, 'utf8')).then((text) => {
    writeFileSync(README, text);
    console.log(`wrote the command table in ${README}`);
  });
}
