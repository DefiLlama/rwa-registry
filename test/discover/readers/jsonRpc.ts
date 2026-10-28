/**
 * jsonRpc: a fake Alchemy node over the http fake, an EVM chain of one block a day whose code starts at a given block.
 * @dev review: src/discover/readers/alchemy.ts
 */
import type { HttpRequest } from '../../../src/clients/http';
import { answering } from '../../fakes/discover';

const hex = (value: number) => `0x${value.toString(16)}`;
// A day a block, so the code search runs to the exact block.
const DAY = 86_400;

interface Call {
  method: string;
  params: unknown[];
}

export const evmNode = (first: number, head = 100) =>
  answering(({ body }: HttpRequest) => {
    const { method, params } = body as Call;
    if (method === 'eth_blockNumber') return { result: hex(head) };
    if (method === 'eth_getCode') return { result: Number(params[1]) >= first ? '0x6080' : '0x' };
    if (method === 'eth_getBlockByNumber') return { result: { timestamp: hex(1751241600 + Number(params[0]) * DAY) } };
    return { error: { code: -32601, message: `no ${method}` } };
  });
