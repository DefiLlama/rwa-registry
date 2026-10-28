/**
 * isinCodes: the valid ISIN codes inside one ISIN item, a bare code or an annotated one; a code whose check digit fails is left out.
 * sheetIsin: a code copied from the sheet, which cites no source, so nobody has verified it yet.
 * @dev review: src/import/mapAssets.ts
 */
const CODE = /\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g;

export const isinValid = (code: string): boolean => {
  const digits = [...code.slice(0, -1)].map((char) => parseInt(char, 36)).join('');
  let total = 0;
  [...digits].reverse().forEach((char, i) => {
    const n = Number(char) * (i % 2 === 0 ? 2 : 1);
    total += Math.floor(n / 10) + (n % 10);
  });
  return (10 - (total % 10)) % 10 === Number(code.at(-1));
};

export const isinCodes = (item: string): string[] => (item.match(CODE) ?? []).filter(isinValid);

export const sheetIsin = (code: string) => ({ scheme: 'isin', value: code, source: null, verified: false });
