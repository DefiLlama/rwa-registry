/**
 * writeFile: a registry or report file as pretty JSON with a final newline, written only when its text changed.
 * @dev review: src/utils/groupBy.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const jsonText = (content: unknown): string => `${JSON.stringify(content, null, 2)}\n`;

export const writeFile = (path: string, content: unknown): boolean => {
  const text = jsonText(content);
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return true;
};
