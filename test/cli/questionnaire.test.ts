import { describe, expect, it } from 'vitest';
import { address } from '../../src/cli/answers/address';
import { link } from '../../src/cli/answers/links';
import { year } from '../../src/cli/answers/numbers';
import { chain } from '../../src/cli/answers/picks';
import { askFields, INTRO, type Assigned, type Field } from '../../src/cli/questionnaire';
import { loadRegistry } from '../../src/registry';
import { baseTree, writeTree } from '../fixtures/tree';
import { each, fakeAsk } from '../fakes/prompter';

const FIELDS: Field[] = [
  { flag: '--platform <slug>', description: 'the platform', required: true },
  { flag: '--symbol <text>', description: 'the symbol', required: true },
  { flag: '--oracle <slug>', description: 'the oracle' },
];

const run = (
  fields: Field[],
  ask: ReturnType<typeof fakeAsk>['ask'] | null,
  flags = {},
  given = {},
  assigned: Assigned[] = [],
  notes: string[] = [],
) => {
  const root = writeTree(baseTree());
  const context = {
    args: [],
    root,
    read: () => undefined,
    note: (line: string) => notes.push(line),
    memo: new Map(),
    registry: loadRegistry(root).registry,
    flags,
  };
  return askFields({ fields, every: true, assigned }, { flags, given, context }, ask);
};

describe('the questionnaire', () => {
  it('asks every field no flag gives, in the order the fields are listed', async () => {
    const prompter = fakeAsk({ platform: 'xstocks', oracle: 'chainlink' });

    const { values } = await run(FIELDS, prompter.ask, { symbol: 'NVDAx' });

    expect(prompter.keys()).toEqual(['platform', 'oracle', 'confirm']);
    expect(values).toMatchObject({ platform: 'xstocks', symbol: 'NVDAx', oracle: 'chainlink' });
  });

  it('skips a field the template gives and lists it as from the file', async () => {
    const prompter = fakeAsk({ symbol: 'NVDAx' });

    const { values } = await run(FIELDS, prompter.ask, {}, { platform: 'xstocks' });
    const confirm = prompter.asked.find((question) => question.key === 'confirm')!;

    expect(prompter.keys()).toEqual(['symbol', 'oracle', 'confirm']);
    expect(values.platform).toBeUndefined();
    expect(confirm.message).toContain('platform: xstocks (from the file)');
  });

  it('leaves an optional field empty on an empty answer, says so in its question and names it at the confirmation', async () => {
    const prompter = fakeAsk({ platform: 'xstocks', symbol: 'NVDAx', oracle: '' });

    const { values, missing } = await run(FIELDS, prompter.ask);
    const [oracle, confirm] = prompter.asked.slice(-2);

    expect(oracle).toMatchObject({ key: 'oracle', optional: true, message: 'the oracle' });
    expect(oracle!.lines).toBeUndefined();
    expect(values.oracle).toBeUndefined();
    expect(missing).toEqual([]);
    expect(confirm!.message).toContain('left empty: oracle');
  });

  it('offers what a field derives from the earlier answers, and fills a field it does not ask', async () => {
    const fields: Field[] = [
      ...FIELDS.slice(0, 2),
      {
        flag: '--canonical-market-id <text>',
        description: 'the canonical market id',
        derive: (values) => ({ value: values.symbol, why: 'the symbol' }),
      },
      {
        flag: '--primary-chain <slug>',
        description: 'the primary chain',
        derive: () => ({ value: 'solana' }),
        asked: () => false,
      },
      { flag: '--from <file>', description: 'a template', asked: () => false },
    ];
    const prompter = fakeAsk({ platform: 'xstocks', symbol: 'NVDAx' });
    const slug: Assigned = { name: 'slug', derive: (values) => String(values.symbol).toLowerCase() };

    const { values } = await run(fields, prompter.ask, {}, {}, [slug]);
    const offered = prompter.asked.find((question) => question.key === 'canonicalMarketId')!;

    expect(prompter.keys()).toEqual(['platform', 'symbol', 'canonicalMarketId', 'confirm']);
    expect(offered).toMatchObject({
      default: 'NVDAx',
      message: 'the canonical market id',
      lines: ['Enter takes the symbol.'],
    });
    expect(values).toMatchObject({ canonicalMarketId: 'NVDAx', primaryChain: 'solana' });
    expect(prompter.asked.at(-1)!.message).toContain('primary-chain: solana (derived)');
    expect(prompter.asked.at(-1)!.message).toContain('slug: nvdax (assigned)');
    expect(prompter.asked.at(-1)!.message).not.toContain('left empty');
  });

  it('asks a leg after a leg while the person wants another, each leg deriving from its own answers', async () => {
    const fields: Field[] = [
      {
        flag: '--deployment <items...>',
        description: 'the deployments',
        required: true,
        legs: {
          fields: [
            { key: 'chain', description: 'the chain', required: true },
            { key: 'deployedAt', description: 'the day', derive: (leg) => ({ value: `${leg.chain} day` }) },
          ],
          item: (leg) => [leg.chain, leg.deployedAt ?? 'unknown'].join(':'),
          split: (item) => ({ chain: item.split(':')[0] }),
          shape: '<chain>:<day>',
          more: 'another deployment?',
        },
      },
    ];
    const prompter = fakeAsk({
      'deployment.chain': each('solana', 'ethereum'),
      'deployment.deployedAt': each('', ''),
      'deployment.more': each(true, false),
    });

    const { values } = await run(fields, prompter.ask);
    const days = prompter.asked.filter((question) => question.key === 'deployment.deployedAt');

    expect(days.map((question) => question.default)).toEqual(['solana day', 'ethereum day']);
    expect(values.deployment).toEqual(['solana:unknown', 'ethereum:unknown']);
  });

  it('marks a required question and asks it again, with the reason, while the answer is empty', async () => {
    const prompter = fakeAsk({ platform: 'xstocks', symbol: each('', 'NVDAx') });

    const { values, missing } = await run(FIELDS, prompter.ask);
    const symbol = prompter.asked.filter((question) => question.key === 'symbol');

    expect(symbol.map((question) => [question.message, question.refused])).toEqual([
      ['the symbol *', undefined],
      ['the symbol *', 'required: type an answer'],
    ]);
    expect(values.symbol).toBe('NVDAx');
    expect(missing).toEqual([]);
  });

  it('asks an answer its type refuses again, with the reason, and keeps the next one', async () => {
    const fields: Field[] = [{ flag: '--founded-year <year>', description: 'the year', answer: year }];
    const prompter = fakeAsk({ foundedYear: each('abc', '2021') });

    const { values } = await run(fields, prompter.ask);

    expect(prompter.asked[1]!.refused).toMatch(/^not a year from 1800 to \d{4}, as 2021$/);
    expect(values.foundedYear).toBe('2021');
  });

  it('refuses a wrong flag before any question, naming the flag, its value and why', async () => {
    const fields: Field[] = [...FIELDS, { flag: '--source <url>', description: 'the source', answer: link }];
    const prompter = fakeAsk({ platform: 'xstocks', symbol: 'NVDAx' });

    const { refused } = await run(fields, prompter.ask, { source: 's' });

    expect(refused).toEqual(['--source s: not a link; a link starts with https://, as https://xstocks.fi']);
    expect(prompter.asked).toEqual([]);
  });

  it('checks a leg flag part by part, the address on the chain given in the same item', async () => {
    const fields: Field[] = [
      {
        flag: '--deployment <items...>',
        description: 'the deployments',
        legs: {
          fields: [
            { key: 'chain', description: 'the chain', answer: chain },
            { key: 'address', description: 'the address', answer: address },
          ],
          item: (leg) => `${leg.chain}:${leg.address}`,
          split: (item) => {
            const [chainKey, token] = item.split(':');
            return token === undefined ? null : { chain: chainKey, address: token };
          },
          shape: '<chain>:<address>',
          more: 'another?',
        },
      },
    ];

    const { refused } = await run(fields, null, {
      deployment: ['solana:0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0', 'base'],
    });

    expect(refused).toEqual([
      '--deployment solana:0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0: not a token address for solana',
      '--deployment base: not <chain>:<address>',
    ]);
  });

  it('notes once, before the first question, that Enter leaves an optional question empty', async () => {
    const notes: string[] = [];

    await run(FIELDS, fakeAsk({ platform: 'xstocks', symbol: 'NVDAx' }).ask, {}, {}, [], notes);

    expect(notes).toEqual([INTRO]);
  });

  it('asks nothing under --no-input and names every missing required field', async () => {
    const { values, missing, cancelled } = await run(FIELDS, null, { oracle: 'chainlink' });

    expect(missing).toEqual(['--platform', '--symbol']);
    expect(values.oracle).toBe('chainlink');
    expect(cancelled).toBe(false);
  });

  it('is cancelled when the person answers no at the confirmation', async () => {
    const prompter = fakeAsk({ platform: 'xstocks', symbol: 'NVDAx', confirm: false });

    const { cancelled } = await run(FIELDS, prompter.ask);

    expect(cancelled).toBe(true);
  });
});
