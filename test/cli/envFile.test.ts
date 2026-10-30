import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadEnvFile } from '../../src/cli/envFile';
import { buildDiscoverDeps } from '../../src/discover/discoverDeps';

const fileWith = (text: string) => {
  const path = join(mkdtempSync(join(tmpdir(), 'rwa-keys-')), 'keys');
  writeFileSync(path, text);
  return path;
};

describe('the env file', () => {
  it('sets each KEY=value line, quotes stripped, a # line and a blank line ignored', () => {
    const env: Record<string, string | undefined> = {};
    const path = fileWith(
      [
        '# the discover keys',
        'ETHERSCAN_API_KEY=e-key',
        '',
        'ALCHEMY_KEY="a key"',
        "SOLSCAN_API_KEY='s=key'",
        '  TONCENTER_API_KEY = t-key  ',
        'not a line',
      ].join('\n'),
    );

    const names = loadEnvFile(path, env);

    expect(env).toEqual({
      ETHERSCAN_API_KEY: 'e-key',
      ALCHEMY_KEY: 'a key',
      SOLSCAN_API_KEY: 's=key',
      TONCENTER_API_KEY: 't-key',
    });
    expect(names).toEqual(['ETHERSCAN_API_KEY', 'ALCHEMY_KEY', 'SOLSCAN_API_KEY', 'TONCENTER_API_KEY']);
  });

  it('leaves a variable the environment already sets as it is', () => {
    const env: Record<string, string | undefined> = { ALCHEMY_KEY: 'from-the-shell' };

    const names = loadEnvFile(fileWith('ALCHEMY_KEY=from-the-file\nPRO_API_KEY=p-key\n'), env);

    expect(env).toEqual({ ALCHEMY_KEY: 'from-the-shell', PRO_API_KEY: 'p-key' });
    expect(names).toEqual(['PRO_API_KEY']);
  });

  it('does nothing when there is no file', () => {
    const env: Record<string, string | undefined> = {};

    expect(loadEnvFile(join(tmpdir(), 'rwa-no-such-keys-file'), env)).toEqual([]);
    expect(env).toEqual({});
  });

  it('gives discover the keys it finds, so no key is named as not set', () => {
    const env: Record<string, string | undefined> = {};
    const log = vi.fn();
    loadEnvFile(
      fileWith('ETHERSCAN_API_KEY=e\nALCHEMY_KEY=a\nSOLSCAN_API_KEY=s\nTONCENTER_API_KEY=t\nPRO_API_KEY=p\n'),
      env,
    );

    const { discover } = buildDiscoverDeps(env, log);

    expect(log).not.toHaveBeenCalled();
    expect(discover.sources.history.apiKey).toBe('p');
  });
});
