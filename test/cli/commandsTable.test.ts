import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commandsTable, README, readmeWithTable } from '../../src/cli/commandsTable';

describe('commandsTable', () => {
  it('equals the committed README, so a flag change without `pnpm docs:commands` fails CI', async () => {
    const committed = readFileSync(README, 'utf8');

    expect(await readmeWithTable(committed)).toBe(committed);
  });

  it('gives each sub-command its row and puts a flag --help marks required in its own column', async () => {
    const rows = (await commandsTable()).split('\n');
    const market = rows.find((row) => row.startsWith('| `add market` |'))!;

    expect(rows.some((row) => row.startsWith('| `add` |'))).toBe(false);
    expect(market.split(' | ')[2]).toBe('`--venue <slug>`, `--tracks <slug>`, `--symbol <text>`, `--structure <slug>`');
    expect(market.split(' | ')[3]).toContain('`--tracks-asset <slug>`');
  });
});
