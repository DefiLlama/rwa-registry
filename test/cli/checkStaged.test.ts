import { describe, expect, it } from 'vitest';
import { checkStaged } from '../../src/cli/checkStaged';
import { loadRegistry } from '../../src/registry';
import { ackFile, baseTree, tslaxFile, writeTree } from '../fixtures/tree';

describe('checkStaged', () => {
  it('stages the acks beside the registry, so a removed ack is found and a new one is checked', () => {
    const root = writeTree({ ...baseTree(), '../acks/flows-hidden/tslax.json': ackFile() });
    const before = loadRegistry(root);

    const problems = checkStaged(root, before, [
      { path: '../acks/flows-hidden/tslax.json', text: '', remove: true },
      { path: '../acks/flows-hidden/nope.json', text: JSON.stringify(ackFile({ slug: 'nope', asset: 'nope' })) },
    ]);

    expect(problems.map((problem) => problem.file)).toEqual(['../acks/flows-hidden/nope.json']);
  });

  it('lets a write bring a new undated deployment with an address, which validate only warns on', () => {
    const root = writeTree(baseTree());
    const before = loadRegistry(root);
    const tslax = tslaxFile();
    const undated = { chain: 'arbitrum', address: `0x${'1'.repeat(40)}`, deployedAt: null };
    const text = JSON.stringify({ ...tslax, deployments: [...tslax.deployments, undated] });

    const problems = checkStaged(root, before, [{ path: 'assets/xstocks/tslax.json', text }]);

    expect(problems).toEqual([]);
  });
});
