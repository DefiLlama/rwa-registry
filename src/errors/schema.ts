/**
 * The schema layer's error: one value in one file that its table schema rejects.
 * @dev review: src/schema/parseRow.ts
 */
import { RwaError } from './rwaError';

export class SchemaError extends RwaError {
  readonly file: string;
  readonly path: string;
  readonly didYouMean: string | null;

  constructor(at: { file: string; path: string; message: string; didYouMean?: string | null }) {
    super('schema', at.message);
    this.file = at.file;
    this.path = at.path;
    this.didYouMean = at.didYouMean ?? null;
  }
}
