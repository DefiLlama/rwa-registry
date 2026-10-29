/**
 * underlyingClasses: the folder an underlying sits in, reference/underlyings/<class>/, is the class its exposure's asset-group value names, and that class is one the asset-group values name at all.
 * @dev review: src/registry/layout.ts
 */
import { UnderlyingClassError } from '../../errors';
import type { Registry } from '../../schema';
import { report, type Problem } from '../problem';

export const underlyingClasses = (registry: Registry): Problem[] => {
  const groups = registry.vocabulary.filter((row) => row.vocabulary === 'asset-group');
  const classOf = new Map(groups.map((row) => [row.slug, row.class ?? null]));
  const classes = [...new Set(groups.map((row) => row.class).filter((value): value is string => !!value))];
  return registry.underlying.flatMap((row) => {
    const expected = classOf.get(row.exposure) ?? null;
    if (expected === row.class) return [];
    const message = !classes.includes(row.class)
      ? `reference/underlyings/${row.class}/ is not a class an asset-group value names; the classes are ${classes.join(', ')}`
      : expected
        ? `exposure ${row.exposure} has class ${expected}, so the file belongs in reference/underlyings/${expected}/`
        : `exposure ${row.exposure} names no class; set class on its asset-group value`;
    return [report(UnderlyingClassError, 'underlying', row, '', message)];
  });
};
