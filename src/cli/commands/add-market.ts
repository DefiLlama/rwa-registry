/**
 * add market: perps/<venue>/<lowercase symbol>.json, with its listing event when the venue dates it or the person gives the day.
 * @dev review: src/cli/addCommand.ts, src/discover/discoverReads.ts
 */
import { marketTarget } from '../../discover/listings/listingReader';
import type { Env } from '../../discover/discoverConfig';
import { discoverReads, type DiscoverReads } from '../../discover/discoverReads';
import { whyOf, type DateResult } from '../../discover/dateResult';
import { listingEvent } from '../../discover/listings';
import { FlagFormatError } from '../../errors/cli';
import { marketFile, marketId } from '../../registry';
import type { Registry } from '../../schema';
import { defineAddCommand, fileContent, organizationChoices, vocabularyChoices, type AddContext } from '../addCommand';
import type { DeriveContext, FlagValues } from '../questionnaire';
import type { WriteContext } from '../writeCommand';

type Deps = { env?: Env; reads?: (log: (line: string) => void) => DiscoverReads };

// The day "unknown" is a market with no listing event on purpose, which the venue is not asked about.
const UNDATED = 'unknown';

const LISTING = 'listing';

// The venue's answer for one market, asked once a run: the question offers it and the files reuse it.
const listingOf = async (deps: Deps, context: WriteContext, registry: Registry, values: FlagValues) => {
  const kept = context.memo.get(LISTING) as DateResult | undefined;
  if (kept) return kept;
  const venue = registry.venue.find((row) => row.slug === values.venue);
  if (!venue || values.symbol === undefined) return undefined;
  const reads = (deps.reads ?? ((log) => discoverReads(deps.env ?? process.env, log)))(context.note);
  const [listing] = await reads.listings([marketTarget({ venue: venue.slug, symbol: String(values.symbol) }, venue)]);
  context.memo.set(LISTING, listing);
  return listing;
};

const listedOf = (deps: Deps) => async (values: FlagValues, context: DeriveContext) => {
  if (context.flags.discover === false) return undefined;
  const listing = await listingOf(deps, context, context.registry, values);
  if (!listing) return undefined;
  if (listing.date === null) return { why: `the venue gives none: ${whyOf(listing)}; type it, or leave it empty` };
  return { value: listing.date, why: `${listing.date} from ${listing.source}, ${listing.basis}` };
};

type Market = { venue: string; symbol: string };

// The day given, with the venue's source when it is the day the venue gave; else the venue's own day; each noted.
const listingEventOf = async (
  listed: unknown,
  market: Market,
  registry: Registry,
  context: AddContext,
  deps: Deps,
): Promise<object | null> => {
  const name = `${market.venue}:${market.symbol}`;
  if (listed === UNDATED) {
    context.note(`${name}: no listing event, as given`);
    return null;
  }
  if (listed !== undefined) {
    const day = String(listed);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new FlagFormatError({ file: 'add market', message: `--listed ${day} is not YYYY-MM-DD or ${UNDATED}` });
    }
    const kept = context.memo.get(LISTING) as DateResult | undefined;
    return kept?.date === day ? listingEvent(kept) : { kind: 'listing', date: day };
  }
  if (context.flags.discover === false) {
    context.note(`${name}: no listing event from the venue under --no-discover`);
    return null;
  }
  const listing = await listingOf(deps, context, registry, market);
  if (!listing) return null;
  if (listing.date === null) {
    context.note(`${name}: no listing date (${whyOf(listing)}), so no listing event`);
    return null;
  }
  context.note(`${name}: listing ${listing.date} from ${listing.source} (${listing.basis})`);
  return listingEvent(listing);
};

// The venue's own symbol is often the underlying's ticker, or the symbol of the asset it tracks.
const symbolOf = (values: FlagValues, { registry }: DeriveContext) => {
  const tracked =
    registry.underlying.find((row) => row.slug === values.tracks)?.ticker ??
    registry.asset.find((row) => row.slug === values.tracksAsset)?.symbol;
  return tracked ? { value: tracked } : undefined;
};

const byName = <T extends { slug: string; name?: string | null }>(rows: T[]) =>
  rows.map((row) => ({ value: row.slug, name: row.name ?? row.slug })).sort((a, b) => a.name.localeCompare(b.name));

export const createAddMarketCommand = (deps: Deps = {}) =>
  defineAddCommand({
    name: 'add market',
    description: 'add one perps market file',
    template: 'market',
    fields: [
      {
        flag: '--venue <slug>',
        description: 'the venue folder under perps/',
        label: 'venue',
        question: 'Which venue lists the market?',
        required: true,
        choices: (registry) => registry.venue.map((row) => row.slug).sort(),
      },
      {
        flag: '--tracks-asset <slug>',
        description: 'the asset it tracks, when it tracks a token',
        label: 'tracked token',
        question: 'Which token does the market track, when it tracks one?',
        lead: true,
        choices: (registry) => byName(registry.asset),
      },
      {
        flag: '--tracks <slug>',
        description: 'the underlying it tracks, tesla-inc',
        label: 'tracked underlying',
        question: 'Which real-world asset does the market track?',
        required: (values) => values.tracksAsset === undefined,
        choices: (registry) => byName(registry.underlying),
      },
      {
        flag: '--symbol <text>',
        description: "the venue's symbol, TSLA",
        label: 'market symbol',
        question: 'Which symbol does the venue give the market?',
        example: 'TSLA',
        required: true,
        derive: symbolOf,
      },
      {
        flag: '--structure <slug>',
        description: 'how the market wraps its exposure, an asset class: stock-perp',
        label: 'asset class',
        question: 'Which asset class is the market, by how it gives its exposure?',
        required: true,
        choices: vocabularyChoices('asset-class'),
      },
      {
        flag: '--pair <text>',
        description: 'the pair as the venue writes it, TSLA-USDC',
        label: 'pair',
        question: 'How does the venue write the pair?',
        example: 'TSLA-USDC',
      },
      {
        flag: '--collateral <slug>',
        description: 'the asset it margins and settles in, or the fx underlying of its fiat currency, us-dollar',
        label: 'collateral',
        question: 'Which asset or currency does the market margin and settle in?',
        example: 'us-dollar',
        open: true,
        choices: (registry) => [
          ...byName(registry.asset),
          ...byName(registry.underlying.filter((row) => row.class === 'fx')),
        ],
      },
      {
        flag: '--oracle <slug>',
        description: "the organization that prices it where it differs from the venue's oracle roles, pyth-network",
        label: 'oracle',
        question: "Which organization prices it, when not the venue's usual oracle?",
        choices: organizationChoices,
        row: 'roles',
      },
      {
        flag: '--listed <date>',
        description: `the listing day, YYYY-MM-DD, or ${UNDATED} for no listing event; asked of the venue by default`,
        label: 'listing day',
        question: 'On which day did the venue list the market?',
        example: `2025-06-30, or ${UNDATED}`,
        date: true,
        derive: listedOf(deps),
        row: 'events',
      },
      {
        flag: '--no-discover',
        description: 'never ask the venue for the listing date; the market gets no listing event from it',
      },
    ],
    derived: ['legacyId'],
    assigned: [
      {
        name: 'id',
        derive: (values) =>
          values.venue === undefined || values.symbol === undefined
            ? undefined
            : marketId({ venue: String(values.venue), symbol: String(values.symbol) }),
      },
    ],
    fromFlags: (values) => ({
      venue: values.venue,
      symbol: values.symbol,
      tracks: values.tracks,
      tracksAsset: values.tracksAsset,
      structure: values.structure,
      pair: values.pair,
      collateral: values.collateral,
      roles: values.oracle === undefined ? undefined : [{ organization: String(values.oracle), kind: 'oracle' }],
    }),
    files: async (template, registry, context) => {
      const market = { venue: String(template.venue), symbol: String(template.symbol) };
      const event = await listingEventOf(context.flags.listed, market, registry, context, deps);
      const events = [...((template.events as unknown[] | undefined) ?? []), ...(event ? [event] : [])];
      return [{ path: marketFile(market), content: fileContent('perp_market', { ...template, events }) }];
    },
  });

export const addMarket = createAddMarketCommand();
