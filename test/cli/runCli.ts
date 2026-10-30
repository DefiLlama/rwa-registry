/**
 * runCli: runs one argv through the CLI's main with the printed lines collected and, when given, a fake prompt; templateCopy writes a changed template to a temp file.
 * @dev review: src/cli/index.ts
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../src/cli';
import type { Ask } from '../../src/cli/ask';
import { templateFile, type TemplateName } from '../../src/cli/templates';

export const runCli = async (argv: string[], ask?: Ask) => {
  const lines: string[] = [];
  const code = await main(argv, { print: (line) => lines.push(line), ask });
  return { code, lines };
};

export const readText = (root: string, path: string) => readFileSync(join(root, path), 'utf8');

export const readJson = (root: string, path: string) => JSON.parse(readText(root, path));

export const templateCopy = (name: TemplateName, change: (template: Record<string, any>) => Record<string, any>) => {
  const path = join(mkdtempSync(join(tmpdir(), 'rwa-template-')), `${name}.json`);
  writeFileSync(path, JSON.stringify(change(JSON.parse(readFileSync(templateFile(name), 'utf8'))), null, 2));
  return path;
};
