# Model

The registry holds 12 tables in six layers, defined in `src/schema/`. A table points only at lower layers, and a pointer into its own table (organization `parent`, venue `parent`, asset `wraps`, deployment `bridgedFrom`) may not loop.
The registry holds static facts only; supply, price, holders, DeFi use, open interest, volume and funding are computed on the server (`server.md`).
A file groups its fields in named blocks (`registry.md`), and the loader flattens each file into one row, so `registry.json` and the server use the field names below, never the block names.

## Tables

| Layer | Table           | Key                                | Points at                                                          | One row is                                                         |
| ----- | --------------- | ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 0     | `vocabulary`    | vocabulary name and `slug`         | nothing                                                            | one value of one closed list                                       |
| 1     | `organization`  | `slug`                             | a parent organization                                              | one firm or brand of one kind: platform, issuer, oracle and others |
| 1     | `underlying`    | `slug`                             | vocabularies                                                       | one economic exposure, such as Tesla stock, gold or the US dollar  |
| 2     | `instrument`    | `slug`                             | vocabularies                                                       | one legal product above one or more assets, such as a fund         |
| 2     | `venue`         | `slug`                             | its organization, a parent venue                                   | one exchange, perp protocol or HIP-3 dex                           |
| 3     | `asset`         | `slug`                             | its platform, underlying, instrument, the asset it wraps           | one fungible token class across all its chains                     |
| 4     | `deployment`    | `chain:address`                    | its asset, the deployment it was bridged from                      | one asset at one address on one chain                              |
| 4     | `perp_market`   | `venue:symbol`                     | its venue, the underlying or asset it tracks, its collateral asset | one perps market on one venue                                      |
| 4     | `role`          | organization, kind, target, `from` | an organization and a target row                                   | one organization in one role on one row, for a period              |
| 5     | `event`         | target, kind, `date`               | a target row and an optional successor                             | one dated change to one row                                        |
| 5     | `address_label` | deployment and holder address      | its deployment                                                     | one holder address left out of active supply                       |
| 5     | `ack`           | `slug`                             | its asset                                                          | one accepted exception to an asset guard, with an end step         |

## Keys and ids

- A slug holds lowercase letters, digits and hyphens, and it is frozen once published. A rename changes the name or label, never the slug. A missing value is `null`, never `0`.
- A role or an event names its target as `{ table, key }`. A role and an address label carry optional `from` and `to` dates. An ack carries `from` and `until`, and `until: null` holds until its resolve step is done.
- `legacyId` on an asset or market is the RWA ID, and `legacyPid` on an organization is the PID. Both keep today's links and saved charts working, so neither may change. `add asset` gives a new asset one above the highest legacy id and never below 9718; a new market or organization gets none.
- An identifier (ISIN, FIGI or LEI) has `scheme`, `value`, `source` and `verified`. `verified` is true only when someone read the value at its source, so a verified identifier names that source. `validate` warns on each unverified identifier and fails one on a row that is new against `--base`.
- An asset's `llamaAttestationProof` is its proof link, or `false` where none is held. Its `yieldPoolIds` are the DefiLlama yields pool ids, UUIDs, that the server's native-yield match may use as an override. Its `registryInfo` is its own registry text, which the server publishes before its issuer's. Oracle proof URLs sit as `sourceLinks` on its oracle roles.
- A chain is a DefiLlama chain key, the key `@defillama/sdk` knows (ethereum, avax, plume_mainnet, ripple), on a deployment, a venue and a platform's `chains`; the registry holds no chain table, nobody adds a chain here, and `validate` fails a key the sdk does not know. The address family of a key comes from the sdk's chain modules (`src/registry/chains.ts`).

## Taxonomy

The taxonomy has three layers, each on one row.

| Layer     | Sits on                  | Values from | Example                                                             |
| --------- | ------------------------ | ----------- | ------------------------------------------------------------------- |
| Exposure  | the underlying           | asset-group | `tesla-inc` is public-equities, `us-dollar` is fiat-currencies      |
| Structure | the asset, or the market | asset-class | stock-backed, synthetic-stock, mmf, t-bills; stock-perp on a market |
| Category  | the asset                | category    | the site's shelves, stocks-equities, first the main one             |

An asset names its categories itself, in `class.category`: a list of slugs of `reference/vocabularies/category.json`, the closed list of the site's shelves, first the main one. `add asset` takes them with `--category`, and `validate` fails an asset with none.
Each asset-group value names a `class`, and an underlying sits in `reference/underlyings/<class>/` for the class of its exposure, so the class is never chosen by hand; `validate` fails a file in any other folder.
An underlying's `aliases` hold the other spellings of its name, for people. They are never matched against a venue symbol.

## Organizations

An organization's `kind` is a value of the organization-kind vocabulary and names its home: a platform lives in `assets/<platform>/platform.json`, a venue operator in `perps/<venue>/organization.json`, and every other kind (issuer, tokenizer, oracle, auditor, custodian, administrator, manager, supervisor, brand, unassigned) in `reference/organizations/<kind>/`. `set <file> kind <value>` moves the file to the home of the new kind, and the checks then decide whether its blocks, assets and venue fit.
Every organization holds `identity`, `about` and `identifiers`. Only a platform or a venue operator holds the `platform` block: category, asset classes, chains, `marginSettlementAsset`, fees and `parentPlatform` (its own slug when it is its own parent; `parent` names only another organization). An issuer source link sits in `sourceLinks` on each issuer role, and an oracle proof link on each oracle role.

## Vocabularies

A vocabulary is one closed list in `registry/reference/vocabularies/<name>.json`. Each value has a `slug` and a `label` and may have a `description`, `aliases` and flags. The slug is `rwaSlug(label)`, the app's rule, so `Stocks & Equities` becomes `stocks-equities`.
`VOCABULARY_NAMES` in `src/schema/enums.ts` lists the vocabularies. A list the app never shows is an enum in the same file, such as the address family, the review outcome and the ack guard.

## Events and status

| Event kind                 | Allowed targets                    | Effect                                                                      |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `listing`                  | asset, market, venue               | Counts toward status.                                                       |
| `delisting`                | asset, market, venue, organization | Counts toward status.                                                       |
| `retirement`               | asset, deployment, market          | Ends its target; needs a reason.                                            |
| `migration`                | asset, deployment                  | Ends its target; `successor` may name the row that follows.                 |
| `split`                    | market                             | Ends its target; `successor` may name the row that follows.                 |
| `maturity`                 | asset                              | Ends its target.                                                            |
| `review`                   | asset, market, organization        | Records a check of the data; a suspicious one needs a reason.               |
| `paused`, `resumed`        | asset, market, venue, organization | No effect on status; `pause` unpublishes a venue and `resume` publishes it. |
| `merge`                    | organization, underlying           | Written by `merge` on the row it keeps.                                     |
| `roll`                     | market                             | A dated note, no effect on status.                                          |
| `attestation`, `wind-down` | asset, organization                | A dated note, no effect on status.                                          |

An ending event ends its target from its date. The server reads no asset that is delisted or ended, and no deployment that has ended. An event with no date counts as having happened and needs a note that says why the date is unknown.

## Derived fields

`build` writes these fields into `registry.json` at its `--at` date, so the server never computes them.

| Field                      | On                                 | Derived from                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primaryChain`             | asset                              | the chain of the deployment marked `primary`, else its platform's primary chain                                                                                                                                               |
| `issuerProtocolIds`        | asset                              | the `protocolIds` of its issuer roles, else the asset's own `protocolIds`                                                                                                                                                     |
| `stablecoin`, `governance` | asset                              | the `impliesStablecoin` and `impliesGovernance` flags of its category, structure and RWA classification; an override in its `class` block with a `flagReason` wins, and `validate` warns once the rule derives the same value |
| `kind`                     | asset                              | `governance` when that flag is set, else `stablecoin`, else `claim`                                                                                                                                                           |
| `chains`                   | asset                              | the chains of its deployments that have not ended                                                                                                                                                                             |
| `name`                     | market                             | the venue organization's name, the name of the tracked underlying or asset, and "Perp"; a stored `name` wins                                                                                                                  |
| `id`                       | market                             | `venue:symbol` in lowercase                                                                                                                                                                                                   |
| `status`                   | asset, market, venue, organization | `retired` once an ending event has happened, `delisted` when the latest listing or delisting event is a delisting, else `listed`                                                                                              |
