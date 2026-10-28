# Import

`import` builds the registry from the two Airtable exports, the sheet the RWA data lived in before this repository. It is a one-off step: at the cutover the registry files become the only source, and `src/import/` and the `import` command are deleted.

```
pnpm rwa import --markets "rwa-Grid view.csv" --platforms "platforms-Grid view.csv" --out import-out \
  --patches patches --dates dates.json
```

## Inputs

- `--markets` is the markets export and `--platforms` the Platforms export. The import first compares each export's header with the columns it reads (`src/import/exportColumns.ts`) and stops with the names of the missing ones, since a renamed column would read as empty on every row.
- `--patches` is a patch file, or a folder of them read in name order, applied over the exports.
- `--dates` is a JSON file with the first and last stored day per legacy id, from the server's daily tables. It dates the listing and delisting events; without it a delisting stays undated.
- The server's code lists that move into data (chain labels, burn addresses, currencies, acks, aliases, the unreleased reserve holders) sit in `src/import/codeLists.ts` and are written into the files on every import. The same file holds the chain lists: `CHAIN_MERGES` folds two spellings of one chain onto the row named by the sdk's chain key, `UNLISTED_CHAINS` keeps a chain in neither DefiLlama's list nor the sdk as a row with the sheet's label, and `FEED_CHAINS` adds a row for a chain only the stablecoins feed names.

## Outputs

The import writes only the registry files that changed, removes the files it no longer produces, then checks the result like `validate` and exits 1 on an error. It also writes four outputs under `--out`.

| Output         | Holds                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `report.md`    | The counts of rows read, files written and problems, each beside the planned count.                        |
| `unmapped.csv` | One row per export cell that did not map, with its id, column, value and reason.                           |
| `calls.md`     | The open questions by topic (taxonomy, organizations, chains, primary chain), each for a person to decide. |
| `held/`        | Candidate patches, one file per topic, each with a `decision` column a person fills.                       |

The held patches propose underlyings to fold together and issuers to merge, found by name rules such as a legal suffix that differs. Each fold row whose decision is `confirmed` keeps its target, adds the dropped name to the target's aliases and moves every reference onto it; the issuer merges land as a reviewed data pull request. The import never overwrites a held file that has a decision column.

## Taxonomy and organizations

The sheet holds an asset group and a list of asset classes on every row, and the import turns them into the three layers of `model.md`.

- Each underlying takes as its `exposure` the asset group most of its assets and markets carry.
- Each asset keeps its first asset class as its `structure`.
- Each structure and exposure pair gets a category rule: the rule already in `category-rules.json`, else the category most of its assets carry.
- Each organization takes the kind of the roles it holds most; one that holds no role goes to `reference/organizations/unassigned/`.

The rows these votes change are lines in `calls.md`. Decide each line by a rule or a patch, and the next import keeps that decision.

## Patches

A patch file is a CSV with the columns `PATCH_COLUMNS` lists in `src/import/applyPatch.ts`: `file,path,old,new,source,fetchedAt,agent,verified`.

- Each row sets one value: the `path` inside one registry `file`, or one cell of an export row when the file is `export:<id>`.
- A row needs a source URL and the day it was read, or it is refused and listed.
- The value `unknown` writes `null`.
- A row whose `old` is not the value in the file is refused, so a stale patch never overwrites a newer edit.

Patch rows come from `set` and `ack`, which write them beside the registry, from `discover dates`, which writes them to its `--out` file, and from hand-written files.

## Discovering dates

`discover dates --out <file>` asks the chains for deployment dates and the venues for listing dates, and appends the answers as patch rows.

- It reads in batches of 25 and appends each batch at once, so a stopped run loses at most one batch. A rerun skips the rows the file already holds.
- A null a later run may answer (a rate limit, a timeout, a family with no reader) is not written and is asked again. A lasting null such as `not-found` is written as `unknown` with its reason.
- The run ends with one line per kind of null: its count, its fate and the first detail.

| Family                                  | Source, in order                                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EVM                                     | Etherscan with `ETHERSCAN_API_KEY`, then the chain's Blockscout explorer when `config/discover.json` names one, then a search over blocks, which needs an archive node and reports `code-search-timeout` when none answers. |
| Solana                                  | Solscan's `created_time` with `SOLSCAN_API_KEY` (basis `created-time`), else the signature walk, which resumes from its last signature on the next run.                                                                     |
| Stellar, XRPL, Tron, Aptos, Sui, TON    | The chain, no key needed; `ALCHEMY_KEY` and `TONCENTER_API_KEY` make Solana and TON faster.                                                                                                                                 |
| cosmos, starknet, algorand, hedera, icp | No reader yet; the rows answer `no-reader`.                                                                                                                                                                                 |

A deployment no explorer or node dates takes the first day the asset's RWA chart on the Pro API holds a value above zero on that chain (basis `first-stored-day`, needs `PRO_API_KEY`). That day is when DefiLlama first stored the asset there, not the contract's creation, so it never replaces a date another source found. The pacing, timeouts and page limits of each source are under `discover` in `config/discover.json` (`operations.md`).
