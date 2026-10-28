import { describe, expect, it } from 'vitest';
import { checkStaged } from '../../src/cli/checkStaged';
import { loadRegistry } from '../../src/registry';
import { baseTree, writeTree } from '../fixtures/tree';

const ack = (slug: string, asset: string) => ({
  slug,
  guard: 'flows-hidden',
  asset,
  from: '2026-10-24',
  reason: 'r',
  resolve: 'r',
});

describe('checkStaged', () => {
  it('stages the acks beside the registry, so a removed ack is found and a new one is checked', () => {
    const root = writeTree({ ...baseTree(), '../acks/tslax-flows.json': ack('tslax-flows', 'tslax') });
    const before = loadRegistry(root);

    const problems = checkStaged(root, before, [
      { path: '../acks/tslax-flows.json', text: '', remove: true },
      { path: '../acks/nope-flows.json', text: JSON.stringify(ack('nope-flows', 'nope')) },
    ]);

    expect(problems.map((problem) => problem.file)).toEqual(['../acks/nope-flows.json']);
  });
});
