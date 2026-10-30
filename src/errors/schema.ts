/**
 * The schema layer's error: one value in one file that its table schema rejects.
 * @dev review: src/schema/parseRow.ts
 */
import { RwaError } from './rwaError';

export class SchemaError extends RwaError {
  readonly file: string;
  readonly path: string;

  constructor(at: { file: string; path: string; message: string }) {
    super(at.message);
    this.file = at.file;
    this.path = at.path;
  }
}
