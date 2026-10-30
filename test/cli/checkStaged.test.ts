import { describe, expect, it } from 'vitest';
import { checkStaged } from '../../src/cli/checkStaged';
import { loadRegistry } from '../../src/registry';
import { baseTree, writeTree } from '../fixtures/tree';

const ack = (asset: string) => ({ slug: asset, asset, from: '2026-10-24', reason: 'r', resolve: 'r' });

describe('checkStaged', () => {
  it('stages the acks beside the registry, so a removed ack is found and a new one is checked', () => {
    const root = writeTree({ ...baseTree(), '../acks/flows-hidden/tslax.json': ack('tslax') });
    const before = loadRegistry(root);

    const problems = checkStaged(root, before, [
      { path: '../acks/flows-hidden/tslax.json', text: '', remove: true },
      { path: '../acks/flows-hidden/nope.json', text: JSON.stringify(ack('nope')) },
    ]);

    expect(problems.map((problem) => problem.file)).toEqual(['../acks/flows-hidden/nope.json']);
  });
});
