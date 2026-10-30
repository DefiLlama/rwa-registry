# Operations

Each section is one thing a maintainer does, with the command as run, what must exist first, what it writes, what it refuses and how to check it. A refusal prints `file: message` and exits 1 having written nothing, and `--dry-run` runs every check and prints the files without writing them. Paths are inside `registry/` unless they start with `acks/` or `dist/`.

| Operation              | Needs first                                                                                                      | Writes                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Add a platform         | Nothing.                                                                                                         | `assets/<slug>/platform.json`                                                       |
| Add an organization    | Its `organization-kind` value, and its parent when it names one.                                                 | `reference/organizations/<kind>/<slug>.json`                                        |
| Add an underlying      | An `asset-group` value that names a class.                                                                       | `reference/underlyings/<class>/<slug>.json`                                         |
| Add a vocabulary value | The vocabulary file.                                                                                             | `reference/vocabularies/<vocabulary>.json`                                          |
| Add a venue            | Its operator when `--organization` names one, its parent venue when named, and its three vocabulary values.      | `perps/<slug>/venue.json`, and `perps/<slug>/organization.json` for a new operator  |
| Add an asset           | Its platform folder, its underlying, the organization of every role and the vocabulary values it names.          | `assets/<platform>/<slug>.json`                                                     |
| Add a market           | Its venue, the underlying or asset it tracks, its `asset-class` value, and its oracle and collateral when named. | `perps/<venue>/<lowercase symbol>.json`                                             |
| Delist                 | The target, and the day, reason and source.                                                                      | A `delisting` event in the target's file.                                           |
| Pause                  | The target, not paused, and the day, reason and source.                                                          | A `paused` event in the target's file; a venue also gets `published: false`.        |
| Resume                 | The target, paused, and the day, reason and source.                                                              | A `resumed` event in the target's file; a venue also gets `published: true`.        |
| Review                 | The asset and a source, and a reason when suspicious.                                                            | A `review` event in the asset's file.                                               |
| Ack                    | The asset or venue it targets, and the flags its kind requires.                                                  | `acks/<kind>/<slug>.json`                                                           |
| Set a field            | The file and a field its schema knows.                                                                           | The same file, or the moved file for an organization's `kind`.                      |
| Merge                  | Both rows, and `--force` when either holds a `legacyPid`.                                                        | Every file that names the dropped row, the kept file, and removes the dropped file. |
| Discover an address    | Nothing.                                                                                                         | Nothing.                                                                            |
| Discover dates         | Nothing; each key only adds a faster source.                                                                     | `deployedAt` in asset files and `listing` events in market files.                   |
| Validate               | Nothing.                                                                                                         | Nothing, or `<dir>/audit/<kind>.csv` under `--out <dir>`.                           |
| Build                  | A registry with no error, and a commit sha.                                                                      | `dist/registry.json`, or `<dir>/registry.json` under `--out <dir>`.                 |
| Release                | A pull request merged into main whose checks pass.                                                               | `registry.json` on the GitHub release tagged `latest`.                              |

## Add a platform

`pnpm rwa add platform --name "Backed Finance"` writes `assets/backed-finance/platform.json`, an organization of kind platform named by the slug of its name, with no PID. It needs nothing first and refuses a folder that has one: `assets/backed-finance/platform.json: already exists; edit the file instead`. Check with `pnpm rwa validate`, which reports `assets/<platform>/platform.json is missing` for any asset whose folder lacks it.

## Add an organization

`pnpm rwa add organization --name "Backed Assets (JE) Limited" --kind issuer` writes `reference/organizations/issuer/backed-assets-je-limited.json`, the kind left to the folder. The kind must be an `organization-kind` value and `--parent` must name an organization: `parent names organization <slug>, which does not exist`. A venue operator is refused with `add organization: a venue operator is added with add venue, beside its venue`. Add the organization before any role or venue names it, then run `validate`.

## Add an underlying

`pnpm rwa add underlying --name "Tesla, Inc." --exposure public-equities --ticker TSLA` writes `reference/underlyings/equity/tesla-inc.json`, in the folder of the class the asset group names. An exposure that is no asset group with a class is refused: `add underlying: exposure <slug> is not an asset-group value with a class`. Check the file and run `validate`.

## Add a vocabulary value

`pnpm rwa add value --vocabulary category --label "Stock Backed"` adds the value to `reference/vocabularies/category.json` in slug order, the slug made from the label unless `--slug` gives it; `--from templates/vocabulary-value.json` also sets `class` and the implied flags. It refuses `<vocabulary> is not a vocabulary` and `<slug> is already in <vocabulary>`. Check the file.

## Add a venue

`pnpm rwa add venue --name Hibachi --venue-type dex --access-model permissionless --rwa-classification programmable-finance --chain arbitrum --adapter hibachi` writes `perps/hibachi/venue.json` unpublished, and `perps/hibachi/organization.json` of kind venue-operator when no organization holds the slug. `--organization` names an operator that exists, of kind venue-operator or platform, and is refused otherwise: `venue <slug> names chainlink, of kind oracle; a venue names its operator in perps/<slug>/organization.json or a platform`. `--published` without an adapter is refused: `venue <slug> is published with no adapter; name one or set published to false`. Check with `validate`, then set `published` to true once the server adapter is merged.

## Add an asset

`pnpm rwa add asset --platform xstocks --symbol NVDAx --name "NVIDIA xStock" --underlying nvidia-corporation --deployment solana:<mint> --type asset --structure stock-backed --rwa-classification rwa --category stocks-equities --issuer backed-assets-je-limited` writes `assets/xstocks/nvdax.json` with the next legacy id. It needs `assets/xstocks/platform.json`, the underlying, the issuer and every `--tokenizer`, `--oracle` and `--auditor` organization, and the `type`, `asset-class`, `rwa-classification` and `category` values. Each missing one is refused by name: `assets/<platform>/platform.json is missing`, `underlying names underlying <slug>, which does not exist`, `add asset: issuer <slug> is not an organization; add it first with add organization`, and `class.structure: "<slug>" is not in vocabulary asset-class, did you mean <nearest>`. A deployment given without its date is dated from the chain, and refused when the chain cannot date it: `<chain>:<address>: no deployment date (<why>); pass :<YYYY-MM-DD>`. Under `--no-discover` it stays undated, and `validate` warns `undated-deployment` until it is set. Check the file and run `validate`; the template route is `templates/README.md`.

## Add a market

`pnpm rwa add market --venue xyz --symbol TSLA --tracks tesla-inc --structure stock-perp --pair TSLA-USDC` writes `perps/xyz/tsla.json`, with a listing event when the venue's listing API dates it (Binance, Bybit, OKX and Gate) and none under `--no-discover`. It needs the venue, the underlying of `--tracks` or the asset of `--tracks-asset` (exactly one), the `asset-class` value, and the `--oracle` organization when given. A template's `terms.collateral` must name an asset or an fx underlying. Each missing row is refused by name, such as `venue names venue <slug>, which does not exist` or `collateral names asset or fx underlying <slug>, which does not exist`, and both tracks at once with `a market tracks exactly one of tracks and tracksAsset`. Check the file and run `validate`.

## Delist

`pnpm rwa delist asset tslax --at 2026-10-30 --reason "Redeemed in full" --source <url>` adds a `delisting` event to the target's file, and the build derives the status from it. The target is `asset <slug>`, `market <venue>:<symbol>`, `venue <slug>` or `platform <slug>`. It refuses `delist: --at is required`, `<slug>: no asset <slug> in the registry` and `<slug> is already delisted`. Check the event at the end of the file's `events`.

## Pause

`pnpm rwa pause venue xyz --at 2026-10-30 --reason "Venue halted trading" --source <url>` adds a `paused` event to the target's file, and on a venue also sets `published: false`, so the server stops publishing it. It takes the same targets and flags as delist and refuses `<slug> is already paused`. Check `events` and `published` in the file.

## Resume

`pnpm rwa resume venue xyz --at 2026-10-31 --reason "Trading back" --source <url>` adds a `resumed` event, and on a venue sets `published: true` again. It refuses a target that is not paused: `<slug> is not paused`. Check `events` and `published` in the file.

## Review

`pnpm rwa review tslax --outcome suspicious --reason "Supply doubles the issuer's report" --source <url> --reviewer akif` adds a `review` event to the asset's file, dated today unless `--at` gives the day. A suspicious outcome without its reason is refused: `review: --reason is required`. Check the event in the file.

## Ack

`pnpm rwa ack asset-move tslax --reason "<evidence>" --resolve "<the step that ends it>"` writes `acks/asset-move/tslax.json`, open-ended without `--until`. An asset or venue target must exist (`<slug>: no asset <slug> in the registry`), and a perps-market target is `<venue>:<symbol>`. A flag the kind lacks is refused (`ack: --day is not a flag of asset-move acks`), and so is a missing one it requires (`ack: --day is required`). `ack --help` lists each kind's flags and `docs/acks.md` their fields; check the file and run `validate`.

## Set a field

`pnpm rwa set registry/assets/xstocks/tslax.json terms.redeemable true` sets one field by its path in the file, read by the field's type: a number, `true`, `false`, `unknown` for null, or a comma-separated list. `--file <json>` replaces the whole file, and `set <organization file> kind <kind>` moves the file to the new kind's folder. It refuses `<path>: is not a registry file`, `<field> is not a field of <table>`, a value of the wrong type such as `terms.redeemable: maybe is not true, false or unknown`, and any error the change brings, checked on a copy. The printed `field: before -> after` lines are the check.

## Merge

`pnpm rwa merge organization <keep> <drop> --reason "<why they are one>" --source <url>` moves every reference from drop to keep, adds a `merge` event with drop's name to keep's file and removes drop's file; for two platforms it also moves drop's assets into keep's folder. It merges an organization or an underlying, both of which must exist (`<slug>: no organization <slug> in the registry`). A row holding a legacy PID is refused without `--force`: `<slug> holds legacyPid <n>, which the app keys on; pass --force with the reason to merge anyway`. Check the removed and changed files it prints and run `validate`.

## Discover an address

`pnpm rwa discover address solana:<mint>` prints what the chain says now: symbol, name, decimals, total supply, deployment day, block, basis and source, or the reason for a null. It writes nothing, and no key is required. Use it before `add asset` to fill the template.

## Discover dates

`pnpm rwa discover dates --platform xstocks --dry-run` asks the chain for every deployment that has an address and no `deployedAt`, and the venue for every market with no listing event, each run narrowed by `--platform`, `--chain`, `--venue` and `--limit`. Without `--dry-run` it writes each date and its `deployedAtBasis` into its file as its batch lands, without the copy check the other writes run, and a null stays to be asked on the next run. No key is required: `ETHERSCAN_API_KEY` dates EVM contracts in place of about 33 RPC reads each, `ALCHEMY_KEY` gives past EVM state and Solana history, `SOLSCAN_API_KEY` dates a Solana mint in one call in place of the signature walk, and `TONCENTER_API_KEY` lifts toncenter above its public rate. A key may be exported in the shell or written in `.env` at the repository root, one `NAME=value` line each (quotes are stripped, a `#` line is skipped), which the CLI reads before any command runs and never prints; a variable the shell already sets wins, and `.env.example` lists the names. A deployment no chain source dates stays null; discover never writes the chart's first stored day, which is DefiLlama's first value and not the contract's creation. Each key left unset prints one line at the start and its reads go to a slower source or answer null with a reason. Check the summary lines (`asked`, `dated`, `null <reason>`) and run `validate`.

## Validate

`pnpm rwa validate` checks every registry file and ack, prints each error as `file: message` and exits 1 on any, and prints one count line per warning kind. `--out <dir>` writes each warning kind's rows to `<dir>/audit/<kind>.csv`.

## Build

`pnpm rwa build --commit local` writes `dist/registry.json`, each row's status derived at today or `--at`. It refuses without the commit (`build needs --commit, the commit the registry is built from`) and on any error, which it prints. It prints the row count of each table as its check.

## Release

Merge the pull request into main. `pr.yml` ran `validate`, typecheck, test and the format check on the pull request; `release.yml` runs them again, then `build --commit <sha>`, and replaces `registry.json` on the release tagged `latest`, the only file it publishes. A failed release posts one line to Discord through the repository secret `RWA_REGISTRY_DISCORD_WEBHOOK`, and without it only logs that none was sent. Nothing runs on a schedule.

## Config and keys

`config/discover.json` writes each key as an `<ENV_NAME>` placeholder filled from the shell, since no command reads a key file; only `discover`, `add asset` and `add market` read the keys. Each source there holds its `concurrency`, `minIntervalMs` and `timeoutMs`; lower `concurrency` for a source that answers `rate-limited`. `sources.http` holds the request and connect timeouts, 30 s each, and `venues` the four exchange listing APIs. Chain reads go through `@defillama/sdk`, which takes its RPC endpoints from its own variables such as `ETHEREUM_RPC` and falls back to slow public nodes.
