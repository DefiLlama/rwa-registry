/**
 * rwaSlug: the app's slug rule, and rowSlug, the same rule for a row the CLI writes, where an underscore is a hyphen too.
 * @dev review: src/registry/checks/displaySlugs.ts
 */
export const rwaSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\W+/g, '-')
    .replace(/^-+|-+$/g, '');

export const rowSlug = (text: string): string => rwaSlug(text.replace(/_/g, '-'));
