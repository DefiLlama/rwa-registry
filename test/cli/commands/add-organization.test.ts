import { describe, expect, it } from 'vitest';
import { templateFile } from '../../../src/cli/templates';
import { baseTree, writeTree } from '../../fixtures/tree';
import { readJson, readText, runCli } from '../runCli';

const NAME = 'Ondo Global Markets (BVI) Limited';
const FILE = 'reference/organizations/issuer/ondo-global-markets-bvi-limited.json';

describe('add organization', () => {
  it('writes reference/organizations/<kind>/<rwaSlug(name)>.json, the kind left to the folder, with no PID', async () => {
    const root = writeTree(baseTree());

    const { code } = await runCli(['add', 'organization', '--registry', root, '--name', NAME, '--kind', 'issuer']);

    expect(code).toBe(0);
    expect(readJson(root, FILE)).toEqual({ identity: { slug: 'ondo-global-markets-bvi-limited', name: NAME } });
  });

  it('refuses a venue operator, which add venue writes beside its venue', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await runCli([
      ...['add', 'organization', '--registry', root, '--name', 'Hibachi', '--kind', 'venue-operator', '--json'],
    ]);

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('add venue');
  });

  it('writes from templates/organization.json the file the flags write', async () => {
    const byFlags = writeTree(baseTree());
    const byFile = writeTree(baseTree());

    await runCli(['add', 'organization', '--registry', byFlags, '--name', NAME, '--kind', 'issuer']);
    const { code } = await runCli([
      'add',
      'organization',
      '--registry',
      byFile,
      '--from',
      templateFile('organization'),
    ]);

    expect(code).toBe(0);
    expect(readText(byFile, FILE)).toBe(readText(byFlags, FILE));
  });
});
