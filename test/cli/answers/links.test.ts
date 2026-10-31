import { describe, expect, it } from 'vitest';
import { link, linkOn } from '../../../src/cli/answers/links';
import { baseTree, registryOf } from '../../fixtures/tree';

const context = { registry: registryOf(baseTree()), values: {} };

describe('link answers', () => {
  it('a link refuses a word and a link that does not open in a browser', () => {
    expect(link.read('s', context)).toEqual({
      refused: 'not a link; a link starts with https://, as https://xstocks.fi',
    });
    expect(link.read('https://xstocks.fi', context)).toEqual({ value: 'https://xstocks.fi' });
  });

  it('a link on a site refuses another host and accepts a subdomain', () => {
    const twitter = linkOn('x.com', 'twitter.com');

    expect(twitter.read('https://t.me/xstocks', context)).toEqual({
      refused: 'not a link on x.com or twitter.com, as https://x.com/...',
    });
    expect(twitter.read('https://mobile.twitter.com/xStocksFi', context)).toHaveProperty('value');
  });
});
