/**
 * The --registry flag every command that reads the registry takes, and the folder it names by default.
 * @dev review: src/cli/index.ts
 */
import { REGISTRY_DIR } from '../registry';

export const REGISTRY_FLAG = {
  spec: '--registry <dir>',
  description: `the registry folder, ${REGISTRY_DIR} by default`,
};

export const registryOf = (value: unknown): string => (typeof value === 'string' ? value : REGISTRY_DIR);
