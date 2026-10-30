import { describe, expect, it } from 'vitest';
import { askFields, type Assigned, type Field } from '../../src/cli/questionnaire';
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
) => {
  const root = writeTree(baseTree());
  const context = {
    args: [],
    root,
    read: () => undefined,
    note: () => undefined,
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

    expect(oracle).toMatchObject({ key: 'oracle', optional: true, message: 'the oracle (Enter to leave empty)' });
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
    expect(offered).toMatchObject({ default: 'NVDAx', message: 'the canonical market id (Enter for the symbol)' });
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
        list: true,
        legs: {
          fields: [
            { key: 'chain', description: 'the chain', required: true },
            { key: 'deployedAt', description: 'the day', derive: (leg) => ({ value: `${leg.chain} day` }) },
          ],
          item: (leg) => [leg.chain, leg.deployedAt ?? 'unknown'].join(':'),
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

  it('asks a required field again, saying it is required, while the answer is empty', async () => {
    const prompter = fakeAsk({ platform: 'xstocks', symbol: each('', 'NVDAx') });

    const { values, missing } = await run(FIELDS, prompter.ask);
    const symbol = prompter.asked.filter((question) => question.key === 'symbol');

    expect(symbol.map((question) => question.message)).toEqual(['the symbol', 'the symbol (required: type an answer)']);
    expect(values.symbol).toBe('NVDAx');
    expect(missing).toEqual([]);
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
