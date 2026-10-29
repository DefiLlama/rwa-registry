/**
 * rwaSlug: the app's slug rule, lowercase with each run of non-word characters one hyphen; rowSlug is the same rule for a row the CLI writes, where "_" is a hyphen too, since a slug holds [a-z0-9-] only.
 * @dev review: src/registry/checks/displaySlugs.ts
 */
export const rwaSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\W+/g, '-')
    .replace(/^-+|-+$/g, '');

export const rowSlug = (text: string): string => rwaSlug(text.replace(/_/g, '-'));
