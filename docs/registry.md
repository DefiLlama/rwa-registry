# Registry

`registry/` holds one JSON file per row. `validate` fails a file outside this layout.

## Layout

| Path                                         | Holds                                   |
| -------------------------------------------- | --------------------------------------- |
| `reference/organizations/<kind>/<slug>.json` | an organization of that kind            |
| `reference/underlyings/<class>/<slug>.json`  | an underlying, in its exposure's class  |
| `reference/vocabularies/<name>.json`         | every value of one vocabulary           |
| `assets/<platform>/platform.json`            | the platform                            |
| `assets/<platform>/<slug>.json`              | an asset of that platform               |
| `perps/<venue>/venue.json`                   | the venue                               |
| `perps/<venue>/organization.json`            | its operator, unless that is a platform |
| `perps/<venue>/<symbol>.json`                | a market, its symbol lowercased         |
| `acks/<kind>/<slug>.json`                    | an ack ([acks.md](acks.md))             |

## Naming

- A file is named by its row's key. Its folder supplies one field: the platform, venue, class, kind or vocabulary.
- Platform, venue operator and vocabulary slugs are `rwaSlug` of the name, since the app matches pages by them.
- An asset's slug is its canonical market id (the symbol by default), with `-<legacyId>` added when it is taken.

## Blocks

Asset, market and organization files group their fields in blocks. `templates/` shows every field.

| File         | Blocks                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- |
| Asset        | `identity`, `exposure`, `class`, `terms`, `sources`, `about`, `review`                       |
| Market       | `identity`, `tracks`, `terms`, `about`, `review`                                             |
| Organization | `identity`, `about`, `identifiers`; `platform` and `review` on platforms and venue operators |
| Venue        | its fields at the top, and `review`                                                          |

Child rows sit in arrays inside their parent: an asset's `deployments`, `roles` and `events`, and a deployment's `labels`. One deployment is `primary`.

`assets/xstocks/tslax.json`, trimmed:

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

`pnpm rwa validate` checks every file against its schema, then runs these checks. `validate <path>` prints the problems of one file.

| Check              | Fails when                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| Schema             | a value is unknown, missing or outside its vocabulary                       |
| References         | a reference names no row, or a role or event targets a table it may not     |
| Cycles             | `wraps` or a `parent` loops                                                 |
| Unique keys        | two rows share a key, a legacy id, a canonical market id or an identifier   |
| Folders            | an asset folder lacks `platform.json`, or a file sits in the wrong folder   |
| File names         | a file is not named by its row's key                                        |
| Display slugs      | a platform, venue operator or vocabulary slug is not `rwaSlug` of its name  |
| Organization kinds | another kind holds the `platform` or `review` block                         |
| Review flags       | a `suspicious` or `delisted` flag disagrees with the row's events           |
| Future events      | a listing, delisting or review event is dated after today                   |
| Primary deployment | an asset has two primary deployments, or none and no platform primary chain |
| Address formats    | an address is not in its chain family's form                                |
| Market tracks      | a market tracks neither or both an underlying and an asset                  |
| Event targets      | an event kind sits on a table it cannot change                              |
| Date order         | a role or ack ends before it starts                                         |
| Ack fields         | an ack lacks a field of its kind or holds one of another                    |
| Published venues   | a published venue names no adapter                                          |

A warning never fails `validate`. It prints one count line per kind, and `--out <dir>` writes each kind's rows to `<dir>/audit/<kind>.csv`.

| Warning                   | When                                             |
| ------------------------- | ------------------------------------------------ |
| `undated-deployment`      | a deployment with an address has no `deployedAt` |
| `contractless-deployment` | a deployment has no address                      |
| `unknown-chain`           | a chain the sdk does not know                    |
| `shared-isin`             | two underlyings share an ISIN                    |
| `stale-flag-override`     | an override equals the derived value             |
| `undated-event`           | an event has no date and nothing says why        |
| `missing-reason`          | a retirement or suspicious review has no reason  |
