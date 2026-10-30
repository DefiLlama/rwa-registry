/**
 * RwaError: the base of every named error, named by its class.
 * @dev review: src/errors/index.ts
 */
export class RwaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}
