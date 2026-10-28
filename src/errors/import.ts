/**
 * The import layer's errors: an export that is not the sheet's csv, and a patch row that cannot be applied.
 * @dev review: src/import/readExport.ts
 */
import { RwaError } from './rwaError';

export class ImportError extends RwaError {
  readonly file: string;
  readonly path: string;

  constructor(at: { file: string; path?: string; message: string; cause?: unknown }) {
    super('import', at.message, { cause: at.cause });
    this.file = at.file;
    this.path = at.path ?? '';
  }
}

export class ExportReadError extends ImportError {}
export class PatchError extends ImportError {}
