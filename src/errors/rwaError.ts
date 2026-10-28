/**
 * RwaError: the base of every named error; `layer` names the src/ folder that raised it.
 * @dev review: src/errors/index.ts
 */
export class RwaError extends Error {
  readonly layer: string;

  constructor(layer: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.layer = layer;
  }
}
