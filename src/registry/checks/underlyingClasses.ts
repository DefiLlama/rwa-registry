/**
 * underlyingClasses: the folder an underlying sits in, reference/underlyings/<class>/, names a value of the underlying-class vocabulary.
 * @dev review: src/registry/layout.ts
 */
import { UnderlyingClassError } from '../../errors';
import type { Registry } from '../../schema';
import { report, type Problem } from '../problem';

export const underlyingClasses = (registry: Registry): Problem[] => {
  const classes = registry.vocabulary.filter((row) => row.vocabulary === 'underlying-class').map((row) => row.slug);
  return registry.underlying
    .filter((row) => !classes.includes(row.class))
    .map((row) => {
      const message = `reference/underlyings/${row.class}/ is not an underlying class; the classes are ${classes.join(', ')}`;
      return report(UnderlyingClassError, 'underlying', row, '', message);
    });
};
