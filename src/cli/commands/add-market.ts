/**
 * add market: perps/<venue>/<lowercase symbol>.json; its published id is the lowercase venue:symbol, so no legacy id unless the template keeps one; its listing event comes from the venue when the venue dates it, and --no-discover asks no venue.
 * @dev review: src/cli/addCommand.ts, src/discover/discoverReads.ts
 */
import { marketTarget } from '../../discover/listings/listingReader';
import type { Env } from '../../config/loadConfig';
import { discoverReads, type DiscoverReads } from '../../discover/discoverReads';
import { whyOf } from '../../discover/dateResult';
import { listingEvent } from '../../discover/listings';
import { marketFile } from '../../registry';
import { defineAddCommand, fileContent, vocabularyChoices } from '../addCommand';

export const createAddMarketCommand = (
  deps: { env?: Env; reads?: (log: (line: string) => void) => DiscoverReads } = {},
) =>
  defineAddCommand({
    name: 'add market',
    description: 'add one perps market file',
    template: 'market',
    fields: [
      { flag: '--venue <slug>', description: 'the venue folder under perps/', required: true },
      { flag: '--symbol <text>', description: "the venue's symbol, TSLA", required: true },
      { flag: '--tracks-asset <slug>', description: 'the asset it tracks, when it tracks a token' },
      {
        flag: '--tracks <slug>',
        description: 'the underlying it tracks, tesla-inc',
        required: (values) => values.tracksAsset === undefined,
      },
      {
        flag: '--structure <slug>',
        description: 'how the market wraps its exposure, an asset class: stock-perp',
        required: true,
        choices: vocabularyChoices('asset-class'),
      },
      { flag: '--pair <text>', description: 'the pair as the venue writes it, TSLA-USDC' },
      {
        flag: '--oracle <text>',
        description: "the market's oracle where it differs from the venue's oracleProvider, Pyth equity feed",
      },
      {
        flag: '--no-discover',
        description: 'never ask the venue for the listing date; the market gets no listing event from it',
      },
    ],
    fromFlags: (values) => ({
      venue: values.venue,
      symbol: values.symbol,
      tracks: values.tracks,
      tracksAsset: values.tracksAsset,
      structure: values.structure,
      pair: values.pair,
      oracleProvider: values.oracle,
    }),
    files: async (template, registry, { note, flags }) => {
      const market = { venue: String(template.venue), symbol: String(template.symbol) };
      const venue = registry.venue.find((row) => row.slug === market.venue);
      const reads =
        flags.discover === false || !venue
          ? null
          : (deps.reads ?? ((log) => discoverReads(deps.env ?? process.env, log)))(note);
      const [listing] = reads ? await reads.listings([marketTarget(market, venue!)]) : [];
      const name = `${market.venue}:${market.symbol}`;
      if (flags.discover === false) note(`${name}: no listing event from the venue under --no-discover`);
      else if (listing && listing.date === null)
        note(`${name}: no listing date (${whyOf(listing)}), so no listing event`);
      else if (listing) note(`${name}: listing ${listing.date} from ${listing.source} (${listing.basis})`);
      const events = [...((template.events as unknown[] | undefined) ?? [])];
      if (listing && listing.date !== null) events.push(listingEvent(listing));
      return [{ path: marketFile(market), content: fileContent('perp_market', { ...template, events }) }];
    },
  });

export const addMarket = createAddMarketCommand();
