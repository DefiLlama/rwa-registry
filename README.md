# rwa-registry

DefiLlama's RWA registry: every asset, organization, underlying, venue and perps market as one JSON file, with the schemas and checks that keep the files valid and the `defillama-rwa` CLI that edits, checks and builds them. No code here runs in production: the server reads the built `registry.json` and computes every number itself (`docs/server.md`).

## Dev setup

Use Node 22 (`.nvmrc`) and pnpm 10.33.2 (`packageManager` in `package.json`).

```
pnpm install
pnpm rwa validate
pnpm typecheck
pnpm test
pnpm format:check
```

CI runs the same four checks on every pull request. `pnpm format` fixes formatting, and `pnpm compile` builds the CLI into `dist/` as `defillama-rwa`.

## Contents

| Folder                 | Holds                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registry/`            | The data, one JSON file per row: `reference/` (organizations, underlyings, vocabularies), `assets/<platform>/` and `perps/<venue>/`, and `key-changes.json`, the published ids ended on purpose. |
| `acks/`                | One file per guard exception, `acks/<kind>/<slug>.json` (`docs/acks.md`).                                                                                                                        |
| `src/`                 | The code, one folder per part: `schema`, `registry`, `cli`, `build`, `discover` and the `clients` it reads through.                                                                              |
| `config/discover.json` | The sources `discover` asks, the venue listing APIs and the pacing, with `<ENV_NAME>` placeholders for keys (`.env.example` names them).                                                         |
| `schema/json/`         | The JSON Schema of each table for editors, written by `pnpm schema`.                                                                                                                             |
| `templates/`           | One JSON file per row an `add` command writes, to fill and pass with `--from` (`templates/README.md`).                                                                                           |
| `test/`                | Mirrors `src/`; `fixtures/tree.ts` is the hand-built registry every test starts from.                                                                                                            |
| `docs/`                | The pages listed at the end of this file.                                                                                                                                                        |
| `.github/workflows/`   | `pr.yml` checks every pull request, `release.yml` publishes every push to main.                                                                                                                  |

## Commands

Run a command with `pnpm rwa <command>`; `--help` lists its flags. Every command except `schema` takes `--registry <dir>`, default `registry`.
Every command that writes takes `--dry-run` (check and print the files, write nothing), `--json` (print JSON, never ask) and `--no-input` (never ask; a missing required flag is an error). Every `add` command also takes `--from <file>`, a filled copy of its template, in place of the flags.
No command and no CI step needs an environment variable; the five keys `discover` can use, each optional, are listed in `.env.example` with what each one enables.

| Command                              | Does                                                                                                                                                                  | Flags that matter                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validate`                           | Checks every registry file and exits 1 on an error.                                                                                                                   | `--base <dir>` adds the checks against main, `--out <dir>` writes each warning kind to a CSV, `--json`.                                                                                          |
| `build`                              | Writes `registry.json`.                                                                                                                                               | `--commit <sha>` (required), `--at <date>`, `--out <dir>` (default `dist`).                                                                                                                      |
| `schema`                             | Writes the JSON Schema of each table.                                                                                                                                 | `--out <dir>` (default `schema/json`).                                                                                                                                                           |
| `add asset`                          | Adds one asset file with the next legacy id.                                                                                                                          | `--platform`, `--symbol`, `--name`, `--underlying`, `--deployment`, `--type`, `--structure`, `--rwa-classification`, `--category`, `--issuer`; `--tokenizer`, `--oracle`, `--auditor` add roles. |
| `add platform`, `add organization`   | Adds a platform's `platform.json`, or a firm under `reference/organizations/<kind>/`.                                                                                 | `--name`, and `--kind` for an organization.                                                                                                                                                      |
| `add venue`                          | Adds one venue file, and its organization when it is new.                                                                                                             | `--name`, `--organization`, `--venue-type`, `--access-model`, `--rwa-classification`, `--adapter`, `--published`.                                                                                |
| `add market`                         | Adds one perps market file, with its listing event when the venue dates it.                                                                                           | `--venue`, `--symbol`, `--tracks` or `--tracks-asset`, `--structure`, `--pair`; `--oracle` adds an oracle role where it differs from the venue's; `--no-discover` asks no venue.                 |
| `add underlying`                     | Adds one underlying file, in the folder of the class its asset group names.                                                                                           | `--name`, `--exposure`.                                                                                                                                                                          |
| `add value`                          | Adds one value to a vocabulary file.                                                                                                                                  | `--vocabulary`, `--label`.                                                                                                                                                                       |
| `delist <target> <slug>`             | Adds a dated delisting event to an asset, market, venue or platform.                                                                                                  | `--at`, `--reason`, `--source`.                                                                                                                                                                  |
| `pause <target> <slug>`              | Adds a dated paused event; a paused venue stops publishing.                                                                                                           | `--at`, `--reason`, `--source`.                                                                                                                                                                  |
| `resume <target> <slug>`             | Adds a dated resumed event after a pause.                                                                                                                             | `--at`, `--reason`, `--source`.                                                                                                                                                                  |
| `review <asset>`                     | Records a review of an asset's data, suspicious or cleared.                                                                                                           | `--outcome`, `--source`, `--reason` when suspicious, `--at`, `--reviewer`.                                                                                                                       |
| `ack <kind> <target>`                | Adds one guard exception in `acks/<kind>/`, open-ended without `--until`.                                                                                             | `--reason`, `--resolve`, `--from`, `--until`, and the flags of its kind (`ack --help`, `docs/acks.md`).                                                                                          |
| `set <file> [field] [value]`         | Sets one field of one file by its path in the file (`terms.redeemable`), the value read by the field's type, or replaces the file; an organization's `kind` moves it. | `--file <json>` replaces the whole file.                                                                                                                                                         |
| `merge <table> <keep> <drop>`        | Merges one organization or underlying into another.                                                                                                                   | `--reason`, `--source`, `--at`, `--force`.                                                                                                                                                       |
| `discover address <chain>:<address>` | Prints what the chain says about one address.                                                                                                                         | `--json`.                                                                                                                                                                                        |
| `discover dates`                     | Sets the deployment dates and listing events it finds in the registry files.                                                                                          | `--platform`, `--chain`, `--venue`, `--limit`, `--dry-run`.                                                                                                                                      |

## Example: add one asset

Ask the chain about the address, fill a copy of the asset template, add it, then check and build.

```
pnpm rwa discover address solana:RNFBzRdzmKcJRwoqd1rGjv2VAAoMBHimge48se3UxKvp
cp templates/asset.json ionqx.json
pnpm rwa add asset --from ionqx.json
pnpm rwa validate
pnpm rwa build --commit local
```

The asset lands in `registry/assets/xstocks/ionqx.json` with the next legacy id. Open a pull request.

## Docs

- [docs/model.md](docs/model.md): the 13 tables, their keys, the taxonomy, the vocabularies, the events and the derived fields.
- [docs/registry.md](docs/registry.md): the file layout, the naming rules, the blocks of a file, the checks and editing with commands.
- [docs/server.md](docs/server.md): what `registry.json` holds, how the server reads it, and how to add a venue.
- [docs/acks.md](docs/acks.md): the guard exceptions, one folder per kind, the fields of each kind and the `ack` command.
- [docs/operations.md](docs/operations.md): the workflows, the review rule, the keys `discover` uses, and the parallel run.
