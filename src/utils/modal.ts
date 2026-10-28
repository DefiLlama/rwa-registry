/**
 * modal: the most common value of a list, ties broken by the value's sort order so a rerun picks the same one.
 * @dev review: src/import/mapPerps.ts
 */
export const modal = <T extends string>(values: readonly T[]): T | null => {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | null = null;
  for (const [value, count] of counts) {
    const top = best == null ? 0 : counts.get(best)!;
    if (count > top || (count === top && best != null && value < best)) best = value;
  }
  return best;
};
