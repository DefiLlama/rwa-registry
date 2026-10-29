/**
 * The named keys: table names, vocabulary file names and the schema enums no page shows.
 * @dev review: src/schema/index.ts
 */
import { z } from 'zod';

export const TABLE_NAMES = [
  'vocabulary',
  'organization',
  'underlying',
  'instrument',
  'venue',
  'asset',
  'deployment',
  'perp_market',
  'role',
  'event',
  'address_label',
  'ack',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export const VOCABULARY_NAMES = [
  'asset-class',
  'category',
  'access-model',
  'rwa-classification',
  'type',
  'venue-type',
  'asset-group',
  'event-kind',
  'role-kind',
  'token-standard',
  'bridge-method',
  'value-model',
  'label-kind',
  'currency',
  'legal-form',
  'access-regime',
  'redemption-frequency',
  'revenue-confidence',
  'organization-kind',
] as const;
export type VocabularyName = (typeof VOCABULARY_NAMES)[number];

export const ADDRESS_FAMILIES = [
  'evm',
  'solana',
  'tron',
  'ton',
  'stellar',
  'xrpl',
  'aptos',
  'sui',
  'starknet',
  'cosmos',
  'icp',
  'algorand',
  'utxo',
  'substrate',
  'near',
  'tezos',
  'cardano',
] as const;
export type AddressFamily = (typeof ADDRESS_FAMILIES)[number];

export const assetKind = z.enum(['claim', 'stablecoin', 'governance']);
export const reviewOutcome = z.enum(['suspicious', 'cleared']);
export const ackGuard = z.enum(['flows-hidden', 'asset-move']);
export const mcapBasis = z.enum(['onchain', 'active']);
export const status = z.enum(['listed', 'delisted', 'retired']);
export const identifierScheme = z.enum(['isin', 'figi', 'lei']);
export const targetTable = z.enum(TABLE_NAMES);

interface EventKind {
  targets: TableName[];
  ends?: true;
  lists?: true;
  reason?: 'always' | 'when-suspicious';
}

// What each event kind does: the tables it targets, whether it ends its target or sets its listing, when it needs a reason.
export const EVENT_KINDS: Record<string, EventKind> = {
  listing: { targets: ['asset', 'perp_market', 'venue'], lists: true },
  delisting: { targets: ['asset', 'perp_market', 'venue', 'organization'], lists: true },
  retirement: { targets: ['asset', 'deployment', 'perp_market'], ends: true, reason: 'always' },
  migration: { targets: ['asset', 'deployment'], ends: true },
  split: { targets: ['perp_market'], ends: true },
  roll: { targets: ['perp_market'] },
  attestation: { targets: ['asset', 'organization'] },
  review: { targets: ['asset', 'perp_market', 'organization'], reason: 'when-suspicious' },
  maturity: { targets: ['asset'], ends: true },
  'wind-down': { targets: ['asset', 'organization'] },
  paused: { targets: ['asset', 'perp_market', 'venue', 'organization'] },
  resumed: { targets: ['asset', 'perp_market', 'venue', 'organization'] },
  merge: { targets: ['organization', 'underlying'] },
};
