# Server

The DefiLlama server reads the registry and computes every number from it: supply, prices, holders, DeFi use, open interest, volume and funding. Server paths below are under `defi/src/` in defillama-server.

## From a merge to the server

Every push to main builds `registry.json` and publishes it on the release tagged `latest` (`operations.md`). Two builds of one registry are byte equal.
At prebuild, the server's `cli/buildRequiresV2.js` downloads that file to `utils/imports/rwa_registry.json`. `RWA_REGISTRY_PATH`, when set, names a local `registry.json` the reader takes instead.

## What registry.json holds

The file is one line of JSON with sorted keys and no timestamp: `{ "commit", "tables", "version" }`. `version` is 1, `commit` is the `--commit` value, and `tables` holds every table's rows by table name (`model.md`).
Each row is flat (`model.md`), and a nested deployment, role, event or address label is a row of its own table. The build fills the derived fields `model.md` lists, so the server reads `primaryChain`, `issuerProtocolIds`, `kind`, `stablecoin`, `governance`, `status`, `chains` and a market's `id` as they are.

## The reader

`rwa/registry/index.ts` checks the file's version, commit and tables, then maps the rows to what the writer, the cron, the perps cron and the guards read. A field the reader maps is a published field, so rename or remove one on the server first.
A legacy id the server knows and `registry.json` lacks is delisted, since a deleted file is a deleted row.
A chain is published as its DefiLlama chain key where the sdk knows the chain, else as the name as written; the server labels a chain and keeps the burn addresses per address family in its own code.

Each fact lives on one row, so the reader falls back to its home where the published row shows it:

- An asset's `twitter`, `docs`, `linkedin`, `discord`, `telegram`, `github` and `refLinks` are its platform's `links`; the asset holds its own `website` only.
- An asset's issuer registry info is the `registryInfo` of the organizations its issuer roles name.
- An asset's issuer source link and oracle proof link are the `sourceLinks` of its issuer and oracle roles.
- An asset's ISIN, where it holds none, is the ISIN of the underlying it tracks.
- A market's logo is the `logo` of the underlying it tracks.
- A market's referral link is its venue organization's `links.refLinks`.
- A market's oracle is the organizations of its own oracle roles, else of its venue's; the registry holds no oracle text.
- A venue's website and issuer name are its organization's `links.website` and `name`, under a market's own `website` or `issuer` where it holds one.
- An organization's parent platform is the organization its `parent` names, else itself.
- A market's margin asset is the symbol of its `collateral` asset, or the currency of the `ticker` where the collateral is an fx underlying (`USD.FX` is USD), and a venue operator's is the collateral most of its venue's markets hold.
- A venue operator's access model, primary chain and chains are its venue's `accessModel` and `chain`.

## What an adapter reads

An adapter is server code under `rwa/adapters/`. From the registry's side it is the rows it reads and one field that names it.

- A supply, price, exclusion or TVL reader claims rows by chain family. It reads a deployment's chain, address and `deployedAt`, the address labels as excluded holders, and an asset's CoinGecko id and canonical market id. A deployment with `address: null`, or on a chain the sdk does not know, puts its chain on the asset's `chains` and nothing more: no reader reads it.
- A platform has no adapter of its own; its assets are read by the readers of their chains.
- A venue's `adapter` field names the server's venue adapter that reads it. A HIP-3 dex with no `adapter` is read by its parent's. `validate` fails a published venue that names none, but it cannot see the server's list, so a wrong id shows up on the server as that venue's markets under `unclaimed` in the run report.
- A venue adapter reads only markets that have a file. It matches a market by its symbol and `aliases`, and takes the venue's `deployerFeeShare` and fees.
- The open-interest unit and each venue's conventions are set in the adapter's code. The venue file's `conventionNote` is a note for people; no code reads it.

## Adding a venue

1. Add the venue adapter on the server, under `rwa/adapters/venues/<id>.ts`, with its test.
2. Run `add venue --adapter <id>` here. The venue stays `published: false` until the server's adapter is merged; then flip it in a pull request.
3. Add each market with `add market`. The server's perps coverage alert lists once a day the markets a venue trades that have no file here, and `rwa/perps/cli/previewAdapters.ts --all` prints the same list on demand.
