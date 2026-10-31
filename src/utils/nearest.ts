/**
 * nearest: the value closest to a typed text by edit distance, as the vocabulary value a misspelled slug meant.
 * @dev review: src/schema/parseRow.ts
 */
export const distance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
};

export const nearest = (input: string, values: string[]): string =>
  values.reduce((best, value) => (distance(input, value) < distance(input, best) ? value : best));
