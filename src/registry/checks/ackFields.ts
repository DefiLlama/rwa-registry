/**
 * ackFields: an ack sits in the folder of a kind, acks/<kind>/, and holds the fields that kind names and no other.
 * @dev review: src/schema/ack.ts
 */
import type { z } from 'zod';
import { SchemaError, UnknownPathError } from '../../errors';
import { schemas, type Registry } from '../../schema';
import { ackKinds } from '../../schema/ack';
import { ACK_KINDS } from '../../schema/enums';
import { placeOf } from '../place';
import { report, toProblem, type Problem } from '../problem';
import type { AnyRow } from '../keys';

const problemsOf = (row: AnyRow, issue: z.core.$ZodIssue): Problem[] => {
  const kind = String(row.kind);
  const at = (field: string, message: string) =>
    toProblem(new SchemaError({ ...placeOf('ack', row, field), message }));
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => at(key, `${key} is not a field of ${kind} acks`));
  }
  const field = issue.path.map(String).join('.');
  return [at(field, issue.input == null ? `${field} is required in ${kind} acks` : `${field}: ${issue.message}`)];
};

export const ackFields = (registry: Registry): Problem[] =>
  (registry.ack as AnyRow[]).flatMap((row) => {
    if (!(ACK_KINDS as readonly unknown[]).includes(row.kind)) {
      const message = `acks/${String(row.kind)}/ is not an ack kind; the kinds are ${ACK_KINDS.join(', ')}`;
      return [report(UnknownPathError, 'ack', row, '', message)];
    }
    // A row the table schema refused has its parse errors already.
    if (!schemas.ack.safeParse(row).success) return [];
    const parsed = ackKinds.safeParse(row, { reportInput: true });
    return parsed.success ? [] : parsed.error.issues.flatMap((issue) => problemsOf(row, issue));
  });
