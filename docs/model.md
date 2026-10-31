# Model

The registry holds 11 tables in six layers, defined in `src/schema/`. A table points only at lower layers, and a pointer into its own table (organization `parent`, venue `parent`, asset `wraps`) may not loop.
The registry holds static facts only; the server computes every number from them (`server.md`).
A file groups its fields in named blocks (`registry.md`), and the loader flattens each file into one row, so `registry.json` and the server use the field names below, never the block names.

## Tables

| Layer | Table           | Key                                                | Points at                                                                           | One row is                                                                  |
| ----- | --------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 0     | `vocabulary`    | vocabulary name and `slug`                         | nothing                                                                             | one value of one closed list                                                |
| 1     | `organization`  | `slug`                                             | a parent organization                                                               | one firm or brand of one kind: platform, issuer, oracle and others          |
| 1     | `underlying`    | `slug`                                             | vocabularies                                                                        | one economic exposure, such as Tesla stock, gold or the US dollar           |
| 2     | `venue`         | `slug`                                             | its organization, a parent venue                                                    | one exchange, perp protocol or HIP-3 dex                                    |
| 3     | `asset`         | `slug`                                             | its platform, underlying, the asset it wraps                                        | one fungible token class across all its chains                              |
| 4     | `deployment`    | `chain:address`, or `asset\|chain` with no address | its asset                                                                           | one asset at one address on one chain, or on a chain with no known contract |
| 4     | `perp_market`   | `venue:symbol`                                     | its venue, the underlying or asset it tracks, its collateral asset or fx underlying | one perps market on one venue                                               |
| 4     | `role`          | organization, kind, target, `from`                 | an organization and a target row                                                    | one organization in one role on one row, for a period                       |
| 5     | `event`         | target, kind, `date`                               | a target row and an optional successor                                              | one dated change to one row                                                 |
| 5     | `address_label` | deployment and holder address                      | its deployment                                                                      | one holder address left out of active supply                                |
| 5     | `ack`           | `kind/slug`                                        | its asset or venue, by kind (`acks.md`)                                             | one accepted exception to a server guard, with an end step                  |

## Keys and ids

- A slug holds lowercase letters, digits and hyphens. A rename changes the name or label and keeps the slug. A missing value is `null`, never `0`.
- A role or an event names its target as `{ table, key }`. A role carries optional `from` and `to` dates.
- `legacyId` on an asset or market is the RWA ID, and `legacyPid` on an organization is the PID. Both keep today's links and saved charts working, so neither may change. `add asset` gives a new asset one above the highest legacy id and never below 9718; a new market or organization gets none.
- An identifier (ISIN, FIGI or LEI) has a `scheme` and a `value`.
- An asset's `yieldPoolIds` are the DefiLlama yields pool ids, UUIDs, that the server's native-yield match may use as an override.
- An asset's `sources.documents` are http or https links to the issuer's documents for that one asset, such as a property's deed or offering memorandum; a value that is not a URL is refused.
- A deployment with `address: null` is a chain the asset is on with no known contract. The chain stays on the asset's `chains` and may be its primary one, no date is asked, an asset holds one per chain, and `validate` warns `contractless-deployment` on each until an address is known.
- A deployment's `deployedAtBasis` says where its `deployedAt` came from: a chain record such as `contract-creation`, `first-code` or `first-signature`, `issuer-announcement` or `explorer-page` for a date read on a page, or `first-stored-day` for DefiLlama's own first stored value, which is not a launch date; any other value is refused.
- A chain on a deployment, a venue and a platform's `chains` is the DefiLlama chain key where `@defillama/sdk` knows the chain (ethereum, avax, plume_mainnet, ripple), else the name as written, lower case with spaces as hyphens (zksync, canton, kinesis, aonea-v-chain). The registry holds no chain table and nobody adds a chain here. The address family of a key comes from the sdk's chain modules, and it drives the address check and the date readers. A chain the sdk does not know is listed and not read: its address is kept as written and is not checked, no date reader asks it, and `validate` warns `unknown-chain` on each deployment, platform chain and venue chain that names it.

## Taxonomy

The taxonomy has three layers, each on one row.

| Layer     | Sits on                  | Values from | Example                                                             |
| --------- | ------------------------ | ----------- | ------------------------------------------------------------------- |
| Exposure  | the underlying           | asset-group | `tesla-inc` is public-equities, `us-dollar` is fiat-currencies      |
| Structure | the asset, or the market | asset-class | stock-backed, synthetic-stock, mmf, t-bills; stock-perp on a market |
| Category  | the asset                | category    | the site's shelves, stocks-equities, first the main one             |

Each asset-group value names a `class`, and an underlying sits in `reference/underlyings/<class>/` for the class of its exposure, so the class is never chosen by hand; `validate` fails a file in any other folder.
An underlying holds one `name`, the legal name as the company writes it ("Digital Realty Trust, Inc."); it has no aliases, and a `merge` keeps the dropped name in its merge event's note.

## Organizations

An organization's `kind` is a value of the organization-kind vocabulary and names its home: a platform lives in `assets/<platform>/platform.json`, a venue operator in `perps/<venue>/organization.json`, and every other kind (issuer, tokenizer, oracle, auditor, custodian, administrator, manager, supervisor, brand, unassigned) in `reference/organizations/<kind>/`. `set <file> kind <value>` moves the file to the home of the new kind, and the checks then decide whether its blocks, assets and venue fit.
Every organization holds `identity`, `about` and `identifiers`. Only a platform or a venue operator holds the `platform` block: category, asset classes, chains and fees. A venue operator's `platform` block holds no access model, chain or margin asset, since those come from its venue (`server.md`). `parent` names the organization it belongs to.

## Vocabularies

A vocabulary is one closed list in `registry/reference/vocabularies/<name>.json`. Each value has a `slug` and a `label` and may have flags, and an asset-group value names its `class`. The slug is `rwaSlug(label)`, the app's rule, so `Stocks & Equities` becomes `stocks-equities`.
A list the app never shows, such as the address family, the review outcome and the ack kind, is an enum in the code, not a vocabulary.

## Events and status

| Event kind                 | Allowed targets                    | Effect                                                                      |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `listing`                  | asset, market, venue, organization | Counts toward status; `relist` writes one on a delisted row.                |
| `delisting`                | asset, market, venue, organization | Counts toward status.                                                       |
| `retirement`               | asset, deployment, market          | Ends its target; needs a reason.                                            |
| `migration`                | asset, deployment                  | Ends its target; `successor` may name the row that follows.                 |
| `split`                    | market                             | Ends its target; `successor` may name the row that follows.                 |
| `maturity`                 | asset                              | Ends its target.                                                            |
| `review`                   | asset, market, venue, organization | Records a check of the data; a suspicious one needs a reason.               |
| `paused`, `resumed`        | asset, market, venue, organization | No effect on status; `pause` unpublishes a venue and `resume` publishes it. |
| `merge`                    | organization, underlying           | Written by `merge` on the row it keeps.                                     |
| `roll`                     | market                             | A dated note, no effect on status.                                          |
| `attestation`, `wind-down` | asset, organization                | A dated note, no effect on status.                                          |

An ending event ends its target from its date. The server reads no asset that is delisted or ended, and no deployment that has ended. An event with no date counts as having happened. `validate` warns `undated-event` on one with neither a note nor a link that says why the date is unknown, and `missing-reason` on a retirement or a suspicious review with no reason.

## Review flags

An asset, a market, a venue and a platform or venue operator each hold `suspicious` and `delisted`, true or false, in their `review` block; no other organization holds them. The flag holds the state and the dated event holds its history, reason and source, and the two never disagree: `delisted` is true exactly when the latest listing or delisting event is a delisting, and `suspicious` exactly when the latest review event found the row suspicious. Every write sets both flags from the file's events, and `validate` fails a flag that disagrees. `validate` also fails a listing, delisting or review event dated after the day it checks at, today or a build's `--at`, so the flags and the status never disagree.
A retirement ends a row without delisting it, so a retired row keeps the `delisted` value of its listing and delisting events, and its status is `retired`.

## Derived fields

`build` writes these fields into `registry.json` at its `--at` date, so the server never computes them.

| Field                      | On                                 | Derived from                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primaryChain`             | asset                              | the chain of the deployment marked `primary`, else its platform's primary chain                                                                                                                                               |
| `issuerProtocolIds`        | asset                              | the `protocolIds` of its issuer roles, else the asset's own `protocolIds`                                                                                                                                                     |
| `stablecoin`, `governance` | asset                              | the `impliesStablecoin` and `impliesGovernance` flags of its category, structure and RWA classification; an override in its `class` block with a `flagReason` wins, and `validate` warns once the rule derives the same value |
| `kind`                     | asset                              | `governance` when that flag is set, else `stablecoin`, else `claim`                                                                                                                                                           |
| `chains`                   | asset                              | the chains of its deployments that have not ended, a chain with no known contract included                                                                                                                                    |
| `id`                       | market                             | `venue:symbol` in lowercase                                                                                                                                                                                                   |
| `status`                   | asset, market, venue, organization | `retired` once an ending event has happened, `delisted` when the latest listing or delisting event is a delisting, else `listed`                                                                                              |
