# Registry

`registry/` holds one JSON file per row, and the acks sit beside it in `acks/` (`acks.md`). A file outside this layout fails `validate`.

## Layout

| Path                                            | Holds                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `reference/organizations/<kind>/<slug>.json`    | One organization of that kind: issuer, oracle, auditor, custodian, administrator and the others. |
| `reference/underlyings/<class>/<slug>.json`     | One underlying, in the folder of the class its exposure's asset-group value names.               |
| `reference/vocabularies/<name>.json`            | Every value of one vocabulary, as an array.                                                      |
| `assets/<platform>/platform.json`               | The platform, an organization of kind `platform`.                                                |
| `assets/<platform>/<slug>.json`                 | One asset of that platform.                                                                      |
| `perps/<venue>/venue.json`, `organization.json` | One venue, and the organization that operates it unless that is a platform.                      |
| `perps/<venue>/<lowercase symbol>.json`         | One market of that venue.                                                                        |
| `../acks/<kind>/<slug>.json`                    | One ack of that kind, at the repository root, as `acks.md` describes each kind.                  |

## Naming rules

- A file is named by its row's key: the slug, or the lowercase symbol for a market. The folder or file name supplies one field the file leaves out: the platform of an asset, the venue of a market, the class of an underlying, the kind of an organization and the name of a vocabulary.
- An organization has one home, which names its kind (`model.md`); one that operates two venues sits beside the first.
- The slug of a platform, of a venue's organization and of a vocabulary value equals `rwaSlug` of its name or label, since the app matches pages by it. The `add` commands make every other slug with the same rule, where `_` also becomes a hyphen. An asset slug is its canonical market id (the symbol by default) and takes `-<legacyId>` at the end when another asset holds it.

## Blocks and nested rows

An asset, market or organization file groups its fields in named blocks; `schema/json/` and `templates/` list every field of each block.

| File         | Blocks                                                                                                                                                                                                                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset        | `identity`, `exposure` (underlying, wraps), `class` (structure, type, RWA classification, a `stablecoin` or `governance` override with its `flagReason`), `terms`, `sources` (CoinGecko id, yields pool ids, identifiers, document links), `about` (description, logo, links), `review` (`activeAumReviewed`, `suspicious`, `delisted`). |
| Market       | `identity`, `tracks` (its `underlying` or `asset`, and its structure), `terms` (its `collateral`: an asset, or an fx underlying such as `us-dollar` where the venue settles in a fiat currency), `about` (description, and the website and issuer where they differ from the venue organization's), `review` (`suspicious`, `delisted`). |
| Organization | `identity`, `about`, `identifiers`, and `platform` and `review` (`suspicious`, `delisted`) only on a platform or a venue operator.                                                                                                                                                                                                       |
| Venue        | Its fields at the top, and `review` (`suspicious`, `delisted`).                                                                                                                                                                                                                                                                          |

An underlying or vocabulary file has no blocks. The `review` block's flags follow the row's events (`model.md`).
Some rows live inside their parent's file, in an array, and leave out the field the parent supplies: an asset holds `deployments`, `roles` and `events`, a deployment its `labels` and `events`, and an organization, underlying, venue or market its `roles` and `events`. One deployment of an asset is marked `primary`, and its issuer role holds the asset's DefiLlama `protocolIds`. This is `assets/xstocks/tslax.json`, trimmed:

```json
{
  "identity": { "slug": "tslax", "symbol": "TSLAx", "legacyId": 257 },
  "exposure": { "underlying": "tesla-inc" },
  "class": {
    "structure": "stock-backed",
    "type": "asset",
    "rwaClassification": "rwa",
    "category": ["stocks-equities"]
  },
  "terms": { "redeemable": true, "transferable": true },
  "sources": { "identifiers": [{ "scheme": "isin", "value": "CH1436219252" }] },
  "deployments": [{ "chain": "solana", "address": "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", "primary": true }],
  "roles": [{ "organization": "backed-assets-je-limited", "kind": "issuer", "protocolIds": [6378] }]
}
```

## Checks

`validate` loads every file against its table's schema, then runs these checks; `validate <path>` loads the same registry and prints only the problems of that one file, a key another file shares with it included.

| Check                     | Fails when                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema                    | A value is unknown, missing or outside its vocabulary.                                                                                                                                                                                                                                                                                                           |
| References                | A reference names no row, or a role or event targets a table its kind may not.                                                                                                                                                                                                                                                                                   |
| Cycles                    | `wraps`, a venue parent or an organization parent loops.                                                                                                                                                                                                                                                                                                         |
| Unique keys               | Two rows share a key, a legacy id, a legacy pid, a canonical market id, a lowercase market id or an identifier (ISIN, FIGI, LEI, across organizations, underlyings and assets), or two holder labels differ only in case. An ISIN shared within one underlying passes, and one on assets or an underlying of two different underlyings only warns `shared-isin`. |
| Dated deployments         | Warns `undated-deployment`: a deployment with an address has no `deployedAt`.                                                                                                                                                                                                                                                                                    |
| Contract-less deployments | Warns `contractless-deployment`: a deployment has no address, so its chain is listed and nothing is read there.                                                                                                                                                                                                                                                  |
| Unknown chains            | Warns `unknown-chain`: a deployment, platform or venue names a chain the sdk does not know, so it keeps the name as written and nothing is read there.                                                                                                                                                                                                           |
| Market tracks             | A market tracks no underlying or asset, or both.                                                                                                                                                                                                                                                                                                                 |
| Folders                   | An asset folder has no `platform.json`, an underlying sits outside the folder of its exposure's class, or an organization folder names no kind.                                                                                                                                                                                                                  |
| Organization kinds        | A kind other than platform or venue operator holds the `platform` or `review` block, or a venue names one of another kind.                                                                                                                                                                                                                                       |
| Review flags              | A `suspicious` or `delisted` flag disagrees with the row's latest review or its latest listing or delisting event, a platform or venue operator lacks one, or one of those events is dated after the day the registry is checked at (`model.md`).                                                                                                                |
| Flag overrides            | Warns `stale-flag-override`: a `stablecoin` or `governance` override equals the value its rule derives.                                                                                                                                                                                                                                                          |
| Primary deployment        | Two deployments of an asset are primary, or it has a contract, none is primary and its platform has no primary chain.                                                                                                                                                                                                                                            |
| File names                | A row sits in a file its key does not name.                                                                                                                                                                                                                                                                                                                      |
| Display slugs             | A platform, venue organization or vocabulary slug is not `rwaSlug` of its name.                                                                                                                                                                                                                                                                                  |
| Address formats           | An address is not in its chain family's form: lowercase for evm, `CODE.issuer` or a bare issuer for xrpl, `CODE-ISSUER` or a C contract for stellar.                                                                                                                                                                                                             |
| Event targets             | An event kind sits on a table it cannot change, such as a split on an asset.                                                                                                                                                                                                                                                                                     |
| Event notes               | Warns `undated-event` when an event has no date, no note, no link and no reason, and `missing-reason` when a retirement or suspicious review has no reason.                                                                                                                                                                                                      |
| Date order                | A role or ack ends before it starts.                                                                                                                                                                                                                                                                                                                             |
| Ack fields                | An ack folder is no kind, or an ack lacks a field of its kind or holds a field of another.                                                                                                                                                                                                                                                                       |
| Published venues          | A published venue names no adapter, its own or its parent's.                                                                                                                                                                                                                                                                                                     |

No check compares the registry with main, so a deleted file is a deleted row (`server.md`).

A warning never fails `validate`, which prints one count line per warning kind, and `--out <dir>` writes each kind's rows to `<dir>/audit/<kind>.csv`.
