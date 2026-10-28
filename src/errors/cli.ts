/**
 * The cli layer's errors, each printed as `file: message` with the command or file it is about.
 * @dev review: src/cli/addCommand.ts
 */
import { RwaError } from './rwaError';

export class CliError extends RwaError {
  readonly file: string;

  constructor(at: { file: string; message: string; cause?: unknown }) {
    super('cli', at.message, { cause: at.cause });
    this.file = at.file;
  }
}

export class MissingFieldError extends CliError {}
export class FlagFormatError extends CliError {}
export class RowExistsError extends CliError {}
export class NoSuchRowError extends CliError {}
export class RowStateError extends CliError {}
export class LegacyIdError extends CliError {}
