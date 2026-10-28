/**
 * commaList: a flag value that holds several items, comma-separated or repeated, as a list with the blanks dropped.
 * @dev review: src/cli/addCommand.ts
 */
export const commaList = (value: unknown): string[] =>
  [value]
    .flat()
    .flatMap((item) =>
      item === undefined || item === null || typeof item === 'boolean' ? [] : String(item).split(','),
    )
    .map((item) => item.trim())
    .filter(Boolean);
