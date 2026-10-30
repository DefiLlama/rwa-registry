/**
 * tables: every registry table's definition, registered below one line each.
 * @dev review: src/schema/index.ts
 */
import { ack } from './ack';
import { addressLabel } from './addressLabel';
import { asset } from './asset';
import type { AnyTableDefinition } from './defineTable';
import type { TableName } from './enums';
import { deployment } from './deployment';
import { event } from './event';
import { instrument } from './instrument';
import { keyChange } from './keyChange';
import { organization } from './organization';
import { perpMarket } from './perpMarket';
import { role } from './role';
import { underlying } from './underlying';
import { venue } from './venue';
import { vocabulary } from './vocabulary';

export const tables = {
  vocabulary,
  organization,
  underlying,
  instrument,
  venue,
  asset,
  deployment,
  perp_market: perpMarket,
  role,
  event,
  address_label: addressLabel,
  ack,
  key_change: keyChange,
} satisfies Record<TableName, AnyTableDefinition>;
