/**
 * id answers: an ISIN, LEI or FIGI with its check digit or form, a DefiLlama protocol id, a yield pool id and a CoinGecko id, each in the form the registry holds.
 * @dev review: src/schema/identifier.ts, src/schema/primitives.ts
 */
import { identifierScheme } from '../../schema/enums';
import { protocolId as protocolType } from '../../schema/primitives';
import { accepted, refused, type AnswerType } from './answerType';

// A letter counts as its base-36 value, A as 10, as ISO 6166 and ISO 17442 both write it.
const digitsOf = (value: string) => [...value].map((char) => parseInt(char, 36).toString()).join('');

// ISO 6166: the Luhn sum over the digits, the check digit included, ends in 0.
const isinHolds = (value: string) => {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value)) return false;
  const sum = [...digitsOf(value)].reverse().reduce((total, char, index) => {
    const doubled = Number(char) * (index % 2 ? 2 : 1);
    return total + Math.floor(doubled / 10) + (doubled % 10);
  }, 0);
  return sum % 10 === 0;
};

// ISO 17442: the number the 20 characters spell leaves 1 when divided by 97.
const leiHolds = (value: string) => /^[A-Z0-9]{18}\d{2}$/.test(value) && BigInt(digitsOf(value)) % 97n === 1n;

const FIGI = /^[B-DF-HJ-NP-TV-Z]{2}G[B-DF-HJ-NP-TV-Z0-9]{8}\d$/;

const HOLDS: Record<string, (value: string) => boolean> = {
  isin: isinHolds,
  lei: leiHolds,
  figi: (value) => FIGI.test(value),
};

export const identifier: AnswerType = {
  shape: 'a scheme and its value, as isin:US88160R1014',
  read: (typed) => {
    const match = /^([a-z]+):(.+)$/i.exec(typed);
    const scheme = match?.[1]!.toLowerCase();
    if (!match || !identifierScheme.safeParse(scheme).success)
      return refused(`not ${identifierScheme.options.join(', ')} and a value, as isin:US88160R1014`);
    const value = match[2]!.trim().toUpperCase();
    return HOLDS[scheme!]!(value) ? accepted({ scheme, value }) : refused(`not a valid ${scheme!.toUpperCase()}`);
  },
};

export const protocolId: AnswerType = {
  shape: 'a DefiLlama protocol id: a number, or parent#<slug>',
  read: (typed) => {
    const value = /^\d+$/.test(typed) ? Number(typed) : typed;
    return protocolType.safeParse(value).success
      ? accepted(value)
      : refused('not a protocol id; a protocol id is a number or parent#<slug>, as 2525');
  },
};

export const poolId: AnswerType = {
  shape: 'a DefiLlama yield pool id, a UUID',
  read: (typed) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(typed)
      ? accepted(typed.toLowerCase())
      : refused('not a yield pool id, as 747c1d2a-c668-4682-b9f9-296708a3dd90'),
};

export const coingeckoId: AnswerType = {
  shape: 'a CoinGecko id, as tesla-xstock',
  read: (typed) =>
    /^[a-z0-9][a-z0-9._-]*$/.test(typed)
      ? accepted(typed)
      : refused('not a CoinGecko id; it holds lowercase letters, digits, dots and hyphens, as tesla-xstock'),
};
