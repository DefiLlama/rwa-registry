# Server

The DefiLlama server reads the registry and computes every number from it: supply, prices, holders, DeFi use, open interest, volume and funding. The registry holds facts and no code that runs in production. Server paths below are under `defi/src/` in defillama-server.

## From a merge to the server

1. Every push to main runs `validate` against the previous commit, the typecheck, the tests and the format check, then `build --commit <sha>`.
2. The build writes one file, `registry.json`. Two builds of one registry are byte equal.
3. The release replaces `registry.json` on the GitHub release tagged `latest` and publishes no other file.
4. At prebuild, the server's `cli/buildRequiresV2.js` downloads that file to the path in `RWA_REGISTRY_PATH`, `utils/imports/rwa_registry.json` by default.

## What registry.json holds

The file is one line of JSON with sorted keys and no timestamp: `{ "commit", "tables", "version" }`. `version` is 1, `commit` is the `--commit` value, and `tables` holds every table's rows by table name, the 12 tables of `model.md`.
Each row is flat: a row has `structure`, not `class.structure`, and a nested deployment, role, event or address label is a row of its own table. The build fills the derived fields `model.md` lists, so the server reads `primaryChain`, `issuerProtocolIds`, `kind`, `stablecoin`, `governance`, `status`, `chains` and a market's `id` as they are.

## The reader

`rwa/registry/index.ts` checks the file's version and commit, then maps the rows to what each job reads.

| Job            | Reads                                                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The writer     | Asset rows as the published metadata rows, with each platform's fields beside them. `assetClass` is the label of the asset's `structure` as a one-item list, `assetGroup` the label of its underlying's `exposure`, `activeMcapData` comes from `activeAumReviewed`. |
| The cron       | Platform rows by `legacyPid`, and the acks for the flows-hidden ids. Not an organization's kind.                                                                                                                                                                     |
| The perps cron | The listed markets of each published venue, with the venue's type. A market's `assetClass` is the label of its `structure`, its `referenceAssetGroup` the exposure of the underlying it tracks, or of the tracked asset's underlying.                                |
| The guards     | The asset-move acks, the retired ids, each asset's first `deployedAt`, the stablecoin and governance flags.                                                                                                                                                          |

The server reads `category` on the asset row, the list the asset carries in its `class` block, first the main one. A field the reader maps is a published field, so rename or remove one on the server first.
A chain is published as its DefiLlama chain key only; the server labels a chain and keeps the burn addresses per address family in its own code.

## What an adapter reads

An adapter is server code under `rwa/adapters/`. From the registry's side it is the rows it reads and one field that names it.

- A supply, price, exclusion or TVL reader claims rows by chain family. It reads a deployment's chain, address and `deployedAt`, the address labels in force as excluded holders, and an asset's CoinGecko id and canonical market id.
- A platform has no adapter of its own; its assets are read by the readers of their chains.
- A venue's `adapter` field names the server's venue adapter that reads it. A HIP-3 dex with no `adapter` is read by its parent's. `validate` fails a published venue that names none, but it cannot see the server's list, so a wrong id shows up on the server as that venue's markets under `unclaimed` in the run report.
- A venue adapter reads only markets that have a file. It matches a market by its symbol and `aliases`, and takes the venue's `deployerFeeShare` and fees.
- The open-interest unit and each venue's conventions are set in the adapter's code. The venue file's `conventionNote` is a note for people; no code reads it.

## Adding a venue

1. Add the venue adapter on the server, under `rwa/adapters/venues/<id>.ts`, with its test.
2. Run `add venue --adapter <id>` here. The venue stays `published: false` until the server's adapter is merged; then flip it in a pull request.
3. Add each market with `add market`. The server's perps coverage alert lists once a day the markets a venue trades that have no file here, and `rwa/perps/cli/previewAdapters.ts --all` prints the same list on demand.
