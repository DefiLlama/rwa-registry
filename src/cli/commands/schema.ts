/**
 * schema: writes the JSON Schema of each table's file under --out (schema/json by default), for editors and CI.
 * @dev review: src/schema/exportJsonSchema.ts
 */
import { exportJsonSchema } from '../../schema';
import type { CliCommand } from '../index';

const DEFAULT_OUT = 'schema/json';

export const schema: CliCommand = {
  name: 'schema',
  description: "write the JSON Schema of each table's file, for editors",
  flags: [{ spec: '--out <dir>', description: `where the files go, ${DEFAULT_OUT} by default` }],
  run: async ({ out }, { print }) => {
    const dir = typeof out === 'string' ? out : DEFAULT_OUT;
    exportJsonSchema(dir);
    print(`wrote the table schemas in ${dir}`);
    return 0;
  },
};
