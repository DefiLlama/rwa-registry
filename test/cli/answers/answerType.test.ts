import { describe, expect, it } from 'vitest';
import { checkAnswer, many, readAnswer } from '../../../src/cli/answers/answerType';
import { link } from '../../../src/cli/answers/links';
import { vocabulary, yesNo } from '../../../src/cli/answers/picks';
import { text } from '../../../src/cli/answers/text';
import { baseTree, registryOf } from '../../fixtures/tree';

const context = { registry: registryOf(baseTree()), values: {} };

describe('checkAnswer', () => {
  it('refuses an empty answer to a required field, in the words of its form', () => {
    expect(checkAnswer(text, true, context)('')).toBe('required: type an answer');
    expect(checkAnswer(vocabulary('category'), true, context)('')).toBe('required: pick one');
    expect(checkAnswer(many(vocabulary('category')), true, context)([])).toBe('required: pick at least one');
    expect(checkAnswer(yesNo, true, context)('')).toBe('required: answer yes or no');
  });

  it('accepts an empty answer to an optional field', () => {
    expect(checkAnswer(link, false, context)('')).toBe(true);
  });

  it('names the item of a list it refuses', () => {
    expect(checkAnswer(many(link), false, context)('https://xstocks.fi, s')).toBe(
      's: not a link; a link starts with https://, as https://xstocks.fi',
    );
  });
});

describe('readAnswer', () => {
  it('reads a list answer item by item', () => {
    expect(readAnswer(many(link), 'https://a.io, https://b.io', context)).toEqual({
      value: ['https://a.io', 'https://b.io'],
    });
  });
});
