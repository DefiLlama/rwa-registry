import { describe, expect, it } from 'vitest';
import { suggested } from '../../../src/cli/answers/text';
import { baseTree, registryOf, xstocksPlatform } from '../../fixtures/tree';

const platform = (slugName: string, headquarters: string) => ({
  identity: { slug: slugName, name: slugName },
  about: { headquarters },
});

const registry = registryOf({
  ...baseTree(),
  'assets/xstocks/platform.json': { ...xstocksPlatform(), about: { headquarters: 'Zug, Switzerland' } },
  'assets/dinari/platform.json': platform('dinari', 'New York, USA'),
  'assets/ondo/platform.json': platform('ondo', 'New York, USA'),
});
const context = { registry, values: {} };

describe('text answers', () => {
  it('a suggested text lists the values the registry holds, the most used first, and accepts a new one', () => {
    const headquarters = suggested('organization', ['headquarters']);

    expect(headquarters.choices!(context)).toEqual(['New York, USA', 'Zug, Switzerland']);
    expect(headquarters.read('Paris, France', context)).toEqual({ value: 'Paris, France' });
  });
});
