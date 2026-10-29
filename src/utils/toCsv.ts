/**
 * toCsv: rows to RFC 4180 text with a header line; a cell holding a comma, a quote or a newline is quoted.
 * @dev review: src/cli/commands/validate.ts
 */
const quote = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = <K extends string>(columns: readonly K[], rows: Record<K, unknown>[]): string =>
  [columns.join(','), ...rows.map((row) => columns.map((column) => quote(row[column])).join(','))].join('\n') + '\n';
