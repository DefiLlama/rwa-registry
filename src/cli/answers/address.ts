/**
 * address: a token address in the key form of the chain answered before it; a family with no form takes any text.
 * @dev review: src/registry/addressFamilies.ts, src/registry/checks/addressFormats.ts
 */
import { ADDRESS_PATTERNS } from '../../registry/addressFamilies';
import { familyOf } from '../../registry/chains';
import { accepted, refused, type AnswerType } from './answerType';

export const address: AnswerType = {
  shape: "the token's contract or mint address on that chain",
  read: (typed, { values }) => {
    const family = familyOf(String(values.chain));
    // An EVM address is keyed lowercase, so a checksummed one is accepted and written lowercase.
    const key = family === 'evm' ? typed.toLowerCase() : typed;
    const pattern = family ? ADDRESS_PATTERNS[family] : undefined;
    return !pattern || pattern.test(key) ? accepted(key) : refused(`not a token address for ${String(values.chain)}`);
  },
};
