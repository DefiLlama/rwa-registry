# Registry

`registry/` holds one JSON file per row, and `src/registry/` is the only code that reads it. The acks sit beside it in `acks/`, since an ack is an exception to a guard and not a fact about a row. A file outside this layout fails `validate`.

## Layout

| Path                                            | Holds                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `reference/instruments/<slug>.json`             | One instrument.                                                                                  |
| `reference/organizations/<kind>/<slug>.json`    | One organization of that kind: issuer, oracle, auditor, custodian, administrator and the others. |
| `reference/underlyings/<class>/<slug>.json`     | One underlying, in the folder of the class its exposure's asset-group value names.               |
| `reference/vocabularies/<name>.json`            | Every value of one vocabulary, as an array.                                                      |
| `assets/<platform>/platform.json`               | The platform, an organization of kind `platform`.                                                |
| `assets/<platform>/<slug>.json`                 | One asset of that platform.                                                                      |
| `perps/<venue>/venue.json`, `organization.json` | One venue, and the organization that operates it unless that is a platform.                      |
| `perps/<venue>/<lowercase symbol>.json`         | One market of that venue.                                                                        |
| `../acks/<slug>.json`                           | One ack, at the repository root.                                                                 |

## Naming rules

- A file is named by its row's key: the slug, or the lowercase symbol for a market. The folder or file name supplies one field the file leaves out: the platform of an asset, the venue of a market, the class of an underlying, the kind of an organization and the name of a vocabulary.
- An organization has one home, which names its kind (`model.md`); one that operates two venues sits beside the first.
- The slug of a platform, of a venue's organization and of a vocabulary value equals `rwaSlug` of its name or label, since the app matches pages by it. The `add` commands make every other slug with the same rule, where `_` also becomes a hyphen. An asset slug is its canonical market id (the symbol by default) and takes `-<legacyId>` at the end when another asset holds it.

## Blocks and nested rows

An asset, market or organization file groups its fields in named blocks; `schema/json/` and `templates/` list every field of each block.

| File         | Blocks                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset        | `identity`, `exposure` (underlying, wraps), `class` (structure, type, RWA classification, a `stablecoin` or `governance` override with its `flagReason`), `terms`, `sources` (CoinGecko id, yields pool ids, identifiers, the Llama attestation proof), `about` (description, logo, the `website` links), `review` (`activeAumReviewed`). |
| Market       | `identity`, `tracks` (its `underlying` or `asset`, and its structure), `terms`, `sources` (the oracle override), `about` (description, and the website and issuer where they differ from the venue organization's).                                                                                                                       |
| Organization | `identity`, `about`, `identifiers`, and `platform` only on a platform or a venue operator.                                                                                                                                                                                                                                                |

An underlying, venue or vocabulary file has no blocks.
Some rows live inside their parent's file, in an array, and leave out the field the parent supplies: an asset holds `deployments`, `roles` and `events`, a deployment its `labels` and `events`, an organization, underlying or venue its `roles` and `events`, an instrument its `roles`, and a market its `events`. One deployment of an asset is marked `primary`, and its issuer role holds the asset's DefiLlama `protocolIds`. This is `assets/xstocks/tslax.json`, trimmed:

```json
{
  "identity": { "slug": "tslax", "symbol": "TSLAx", "legacyId": 257 },
  "exposure": { "underlying": "tesla-inc" },
  "class": { "structure": "stock-backed", "type": "asset", "rwaClassification": "true-rwa" },
  "terms": { "redeemable": true, "transferable": true },
  "sources": { "identifiers": [{ "scheme": "isin", "value": "CH1436219252", "source": null, "verified": false }] },
  "deployments": [{ "chain": "solana", "address": "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", "primary": true }],
  "roles": [{ "organization": "backed-assets-je-limited", "kind": "issuer", "protocolIds": [6378] }]
}
```

## Checks

`validate` loads every file against its table's schema, then runs the checks in `src/registry/checks/` and the published venue check in `src/build/`.

| Check              | Fails when                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema             | A value is unknown, missing or outside its vocabulary.                                                                                          |
| References         | A reference names no row, a chain is not a DefiLlama chain key, or a role or event targets a table its kind may not.                            |
| Cycles             | `wraps`, `bridgedFrom`, a venue parent or an organization parent loops.                                                                         |
| Unique keys        | Two rows share a key, a legacy id, a canonical market id or a lowercase market id.                                                              |
| Frozen keys        | With `--base`, a published legacy id changed, or the row that holds it was renamed or deleted.                                                  |
| Dated deployments  | With `--base`, a new deployment has no `deployedAt`.                                                                                            |
| Market tracks      | A market tracks no underlying or asset, or both.                                                                                                |
| Folders            | An asset folder has no `platform.json`, an underlying sits outside the folder of its exposure's class, or an organization folder names no kind. |
| Organization kinds | A kind other than platform or venue operator holds the `platform` block, or a venue names one of another kind.                                  |
| Flag overrides     | Warns only: a `stablecoin` or `governance` override equals the value its rule derives.                                                          |
| Primary deployment | Two deployments of an asset are primary, or none is and its platform has no primary chain.                                                      |
| Identifier sources | With `--base`, a new row holds an identifier that is not verified.                                                                              |
| File names         | A row sits in a file its key does not name.                                                                                                     |
| Display slugs      | A platform, venue organization or vocabulary slug is not `rwaSlug` of its name.                                                                 |
| Address formats    | An address is not in its chain family's form: lowercase for evm, `CODE.issuer` or a bare issuer for xrpl, `CODE-ISSUER` for stellar.            |
| Event targets      | An event kind sits on a table it cannot change, such as a split on an asset.                                                                    |
| Event notes        | A new event has no date and no note, or a retirement or suspicious review has no reason.                                                        |
| Date order         | A label, role or ack ends before it starts.                                                                                                     |
| Published venues   | A published venue names no adapter, its own or its parent's.                                                                                    |

A warning never fails `validate`. It marks a row on main that breaks a rule new rows must keep (an undated deployment, an unverified identifier) or a change a person should confirm (one ISIN on two assets). `validate` prints one count line per warning kind, and `--out <dir>` writes each kind's rows to `<dir>/audit/<kind>.csv`.

## Editing with commands

- A command that writes first checks its new, changed and removed files on a copy of the registry. On an error it prints `file: message`, writes nothing and exits 1. An `add` command never overwrites a file that exists, and it marks an identifier `verified` only when it names a source URL.
- A row must exist before another row names it: an asset needs its platform's `platform.json`, its underlying and its issuer; a market needs its venue; a role or venue needs its organization.
- A new deployment needs a date, which `add asset` takes from `:<YYYY-MM-DD>` on `--deployment` or else asks the chain; under `--no-discover` it stays undated and `validate` warns until the date is set.
- `set` names a field by its path in the file, such as `terms.redeemable`, and reads the value by the field's type: a number, `true`, `false`, `unknown` for null, or a comma-separated list.
