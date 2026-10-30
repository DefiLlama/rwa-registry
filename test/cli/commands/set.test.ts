import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseTree, marketWith, writeTree } from '../../fixtures/tree';
import { readJson, runCli } from '../runCli';

const TSLAX = 'assets/xstocks/tslax.json';
const TSLA = 'perps/xyz/tsla.json';
const set = (root: string, ...rest: string[]) => runCli(['set', ...rest, '--registry', root]);

describe('set', () => {
  it('writes a number parsed through the schema', async () => {
    const root = writeTree({ ...baseTree(), [TSLA]: marketWith({ makerFeeBps: 3 }) });

    const { code } = await set(root, TSLA, 'terms.makerFeeBps', '1.5');

    expect(code).toBe(0);
    expect(readJson(root, TSLA).terms.makerFeeBps).toBe(1.5);
  });

  it('refuses a value that is not of the field type', async () => {
    const root = writeTree(baseTree());

    const { code, lines } = await set(root, TSLA, 'terms.makerFeeBps', 'five');

    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/terms\.makerFeeBps: five is not a number/);
  });

  it.each([
    ['terms.redeemable', 'false', false],
    ['terms.redeemable', 'unknown', null],
    ['about.links.website', 'https://xstocks.fi/,https://backed.fi/', ['https://xstocks.fi/', 'https://backed.fi/']],
  ])('parses %s from %s by the field type', async (path, text, value) => {
    const root = writeTree(baseTree());

    const { code } = await set(root, TSLAX, path, text);

    expect(code).toBe(0);
    expect(path.split('.').reduce((at, key) => at[key], readJson(root, TSLAX))).toEqual(value);
  });

  it('sets a nested field by its path', async () => {
    const root = writeTree(baseTree());

    const { code } = await set(root, TSLAX, 'deployments[0].deployedAt', '2025-06-29');

    expect(code).toBe(0);
    expect(readJson(root, TSLAX).deployments[0].deployedAt).toBe('2025-06-29');
  });

  it('refuses a field the table does not have, and names the block of a field given without it', async () => {
    const root = writeTree(baseTree());

    const unknown = await set(root, TSLAX, 'issuer', 'backed');
    const bare = await set(root, TSLAX, 'redeemable', 'true');

    expect(unknown.code).toBe(1);
    expect(unknown.lines.join('\n')).toMatch(/issuer is not a field of asset/);
    expect(bare.lines.join('\n')).toMatch(/redeemable is at terms\.redeemable in an asset file/);
  });

  it('--file replaces the whole file through the same checks', async () => {
    const root = writeTree(baseTree());
    const next = join(dirname(root), 'tslax.json');
    const before = readJson(root, TSLAX);
    writeFileSync(
      next,
      JSON.stringify({
        ...before,
        identity: { ...before.identity, name: 'Tesla xStock (TSLAx)' },
        terms: { cexListed: false },
      }),
    );

    const { code } = await set(root, TSLAX, '--file', next);

    expect(code).toBe(0);
    expect(readJson(root, TSLAX)).toMatchObject({
      identity: { name: 'Tesla xStock (TSLAx)' },
      terms: { cexListed: false },
    });
  });

  it('writes a list of rows given as JSON as rows, so a roles cell lands whole', async () => {
    const root = writeTree(baseTree());
    const roles = [{ organization: 'backed-assets-je-limited', kind: 'issuer', protocolIds: [6378] }];

    const { code } = await set(root, TSLAX, 'roles', JSON.stringify(roles));

    expect(code).toBe(0);
    expect(readJson(root, TSLAX).roles).toEqual(roles);
  });

  it('writes a field the file lacks where the schema puts it, not after the nested rows', async () => {
    const root = writeTree(baseTree());

    const { code } = await set(
      root,
      TSLAX,
      'deployments[0].bridgedFrom',
      'ethereum:0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0',
    );

    expect(code).toBe(0);
    expect(Object.keys(readJson(root, TSLAX).deployments[0])).toEqual([
      'chain',
      'address',
      'deployedAt',
      'primary',
      'bridgedFrom',
      'labels',
    ]);
  });

  it('moves an organization to the folder of the kind it is set to', async () => {
    const root = writeTree(baseTree());
    const from = 'reference/organizations/issuer/backed-assets-je-limited.json';
    const file = readJson(root, from);

    const { code } = await set(root, from, 'kind', 'oracle');

    expect(code).toBe(0);
    expect(existsSync(join(root, from))).toBe(false);
    expect(readJson(root, 'reference/organizations/oracle/backed-assets-je-limited.json')).toEqual(file);
  });
});
