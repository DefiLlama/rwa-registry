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

| Folder                 | Holds                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `registry/`            | The data, one JSON file per row: `reference/` (organizations, underlyings, vocabularies) and `assets/<platform>/` and `perps/<venue>/`. |
| `acks/`                | One file per guard exception, `acks/<kind>/<slug>.json` (`docs/acks.md`).                                                               |
| `src/`                 | The code, one folder per part: `schema`, `registry`, `cli`, `build`, `discover` and the `clients` it reads through.                     |
| `config/discover.json` | The sources `discover` asks, the venue listing APIs and the pacing (`docs/operations.md`).                                              |
| `schema/json/`         | The JSON Schema of each table for editors, written by `pnpm schema`.                                                                    |
| `templates/`           | One JSON file per row an `add` command writes, to fill and pass with `--from` (`templates/README.md`).                                  |
| `test/`                | The tests, with their fixtures and fakes.                                                                                               |
| `docs/`                | The pages listed at the end of this file.                                                                                               |
| `.github/workflows/`   | `pr.yml` checks every pull request, `release.yml` publishes every push to main.                                                         |

## Commands

Run a command with `pnpm rwa <command>`; `--help` lists its flags.
Every command that writes, except `discover dates`, first checks its result on a copy of the registry: on an error it prints `file: message`, writes nothing and exits 1. An `add` command never overwrites a file that exists, and `discover` never asks for input.

| Command                              | Does                                                                                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate`                           | Checks every registry file and exits 1 on an error.                                                                                                                                                                                                |
| `build`                              | Writes `registry.json`.                                                                                                                                                                                                                            |
| `schema`                             | Writes the JSON Schema of each table.                                                                                                                                                                                                              |
| `add asset`                          | Adds one asset file with the next legacy id.                                                                                                                                                                                                       |
| `add platform`, `add organization`   | Adds a platform's `platform.json`, or a firm under `reference/organizations/<kind>/`.                                                                                                                                                              |
| `add venue`                          | Adds one venue file, and its organization when it is new.                                                                                                                                                                                          |
| `add market`                         | Adds one perps market file, with its listing event when the venue dates it.                                                                                                                                                                        |
| `add underlying`                     | Adds one underlying file, in the folder of the class its asset group names.                                                                                                                                                                        |
| `add value`                          | Adds one value to a vocabulary file.                                                                                                                                                                                                               |
| `delist <target> <slug>`             | Adds a dated delisting event to an asset, market, venue or platform.                                                                                                                                                                               |
| `pause <target> <slug>`              | Adds a dated paused event; a paused venue stops publishing.                                                                                                                                                                                        |
| `resume <target> <slug>`             | Adds a dated resumed event after a pause.                                                                                                                                                                                                          |
| `review <asset>`                     | Records a review of an asset's data, suspicious or cleared.                                                                                                                                                                                        |
| `ack <kind> <target>`                | Adds one guard exception in `acks/<kind>/`, open-ended without `--until`.                                                                                                                                                                          |
| `set <file> [field] [value]`         | Sets one field of one file by its path in the file (`terms.redeemable`), or replaces the file; an organization's `kind` moves it. The value is read by the field's type: a number, `true`, `false`, `unknown` for null, or a comma-separated list. |
| `merge <table> <keep> <drop>`        | Merges one organization or underlying into another.                                                                                                                                                                                                |
| `discover address <chain>:<address>` | Prints what the chain says about one address.                                                                                                                                                                                                      |
| `discover dates`                     | Sets the deployment dates and listing events it finds in the registry files.                                                                                                                                                                       |

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

- [docs/model.md](docs/model.md): the tables, their keys, the taxonomy, the vocabularies, the events and the derived fields.
- [docs/registry.md](docs/registry.md): the file layout, the naming rules, the blocks of a file and the checks.
- [docs/server.md](docs/server.md): what `registry.json` holds, how the server reads it, and how to add a venue.
- [docs/acks.md](docs/acks.md): the guard exceptions, one folder per kind, the fields of each kind and the `ack` command.
- [docs/operations.md](docs/operations.md): the workflows and the keys `discover` uses.
