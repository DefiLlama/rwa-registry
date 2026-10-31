import { describe, expect, it } from 'vitest';
import { commands } from '../../src/cli';
import type { Question } from '../../src/cli/ask';
import { askFields, isEmpty, optionKey, type Field, type FlagValues } from '../../src/cli/questionnaire';
import { loadRegistry } from '../../src/registry';
import { ACK_KINDS } from '../../src/schema/enums';
import { baseTree, writeTree } from '../fixtures/tree';

// Typed answers a person might give, tried in order until the question's check accepts one.
const TYPED = ['x', 'https://example.com', '2026-10-01', '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0', '5', '0:1000'];

// A person who presses Enter on a default and otherwise gives the first choice or a typed answer its check accepts, or leaves an optional one empty; one deployment, then yes.
const answerOf = (question: Question): string | string[] | boolean => {
  if (question.key.endsWith('.more')) return false;
  if (question.key === 'confirm') return true;
  if (!isEmpty(question.default)) return question.default!;
  if (question.confirm) return true;
  const [first] = question.choices ?? [];
  const value = first === undefined ? undefined : typeof first === 'string' ? first : first.value;
  if (value !== undefined) return question.many ? [value] : value;
  return TYPED.find((typed) => question.check?.(typed) === true) ?? (question.optional ? '' : 'x');
};

const walk = async (fields: Field[], flags: FlagValues) => {
  const root = writeTree(baseTree());
  const asked: Question[] = [];
  const ask = async (question: Question) => {
    asked.push(question);
    if (question.refused)
      throw new Error(`${question.key}: no answer the walk gives passes its check (${question.refused})`);
    return answerOf(question);
  };
  const context = {
    args: [],
    root,
    read: () => undefined,
    note: () => undefined,
    memo: new Map(),
    registry: loadRegistry(root).registry,
    flags,
  };
  const answers = await askFields({ fields, every: true }, { flags, given: {}, context }, ask);
  return { ...answers, asked };
};

// Every command that asks, with ack once per kind, as each kind asks its own fields; discover is off, so nothing reads the network.
const RUNS = commands.flatMap((command) => {
  if (!command.questions) return [];
  const kinds = command.name === 'ack' ? ACK_KINDS.map((kind) => ({ kind })) : [{}];
  return kinds.map((flags) => ({
    name: [command.name, ...Object.values(flags)].join(' '),
    fields: command.questions!,
    flags: { discover: false, ...flags },
  }));
});

const requiredOf = (field: Field, values: FlagValues) =>
  typeof field.required === 'function' ? field.required(values) : field.required === true;

// The last line without the required mark: what the person reads as the question, below the list a confirmation shows.
const sentenceOf = (message: string) => message.split('\n').at(-1)!.replace(/ \*$/, '');

describe('the questions of every command', () => {
  it('cover every write command but set', () => {
    expect(RUNS.map(({ name }) => name.split(' ').slice(0, 2).join(' '))).toEqual(
      expect.arrayContaining([
        ...['add asset', 'add platform', 'add venue', 'add market', 'add organization', 'add underlying', 'add value'],
        ...['delist', 'pause', 'resume', 'review', 'ack asset-move', 'merge'].map((name) =>
          expect.stringMatching(`^${name}`),
        ),
      ]),
    );
  });

  it.each(RUNS)('$name asks every required field it is not given and refuses nothing at the end', async (run) => {
    const { values, missing, asked } = await walk(run.fields, run.flags);
    const keys = new Set(asked.map((question) => question.key.split('.')[0]));

    const required = run.fields.filter(
      (field) => requiredOf(field, values) && run.flags[optionKey(field.flag) as 'kind'] === undefined,
    );

    expect(missing).toEqual([]);
    expect(required.map((field) => optionKey(field.flag)).filter((key) => !keys.has(key))).toEqual([]);
  });

  it.each(RUNS)('$name asks each field as a plain question, no slug glued to it and no skip', async (run) => {
    const { asked } = await walk(run.fields, run.flags);

    for (const question of asked) {
      const sentence = sentenceOf(question.message);
      expect(sentence, question.key).toMatch(/^[A-Z][^?]*\?$/);
      expect(sentence, question.key).not.toMatch(/[,:]\s*[a-z0-9]+(-[a-z0-9]+)+/);
      expect(question.message, question.key).not.toMatch(/skip/i);
    }
  });
});
