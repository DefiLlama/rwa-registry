/**
 * relist: a dated listing event on a delisted asset, market, venue or platform, which clears its delisted flag; delist's counterpart.
 * @dev review: src/cli/eventCommand.ts, then src/cli/commands/delist.ts
 */
import { reviewFlagsOf } from '../../registry/reviewFlags';
import { defineEventCommand } from '../eventCommand';

export const relist = defineEventCommand({
  name: 'relist',
  description: 'relist a delisted asset, market, venue or platform: clear delisted and add a dated listing event',
  kind: 'listing',
  state: (events) => (reviewFlagsOf(events).delisted ? null : 'is not delisted'),
});
