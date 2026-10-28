# Migrate

`migrate` lands the two Airtable exports in an empty registry through the add commands, one stage at a time. `apply` then lands a batch of fixes through `set`, `merge` and `ack`, one batch at a time. Each call runs the command's own refusals and every registry check, in batches of 250 in one process; a row the command refuses is held with its reason, never forced.

## Stages

Run the stages in this order, since each names rows of the ones before it.

| Stage           | Lands                                                                                    | Through                     |
| --------------- | ---------------------------------------------------------------------------------------- | --------------------------- |
| `vocabularies`  | the values of every closed list, then the category rules                                 | `add value`, `add rule`     |
| `chains`        | `reference/chains/`                                                                      | `add chain`                 |
| `organizations` | `reference/organizations/<kind>/`, parents first                                         | `add organization`          |
| `underlyings`   | `reference/underlyings/<class>/`                                                         | `add underlying`            |
| `platforms`     | `assets/<platform>/platform.json`, each venue with its operator beside                   | `add platform`, `add venue` |
| `assets`        | `assets/<platform>/<slug>.json`, a wrapped asset after its inner one; the code-list acks | `add asset`, `ack`          |
| `markets`       | `perps/<venue>/<symbol>.json`                                                            | `add market`                |

```
pnpm rwa migrate --markets "rwa-Grid view.csv" --platforms "platforms-Grid view.csv" --stage vocabularies --from-registry ../rwa-registry/registry --batches batches --out migrate-out
pnpm rwa migrate --markets "rwa-Grid view.csv" --platforms "platforms-Grid view.csv" --stage chains --batches batches --out migrate-out
pnpm rwa apply --batch batches/01.csv --markets "rwa-Grid view.csv" --platforms "platforms-Grid view.csv" --out migrate-out
```

- Each stage maps the exports with the import's own mapping (`mapExports` in `src/import/importExports.ts`): the header check, the vocabulary folds, the code lists and the moved fields are the import's.
- A sheet row keeps its RWA ID, PID and slug. Its deployments stay undated until the dates batch lands; no chain or venue is asked.
- A sheet row is the registry's own data moving, not a row new against main, so the checks run as `validate` runs them without `--base`. An undated deployment, an unread identifier or an undated event warns.
- `--from-registry <dir>`, with the vocabularies stage only, also lands the vocabularies and `category-rules.json` of another registry, with the sheet's values folded in. A value or rule both hold lands as the registry has it.
- `--batches <dir>` applies the oracle map and the oracle firms of every csv in the folder over the exports, so the oracle firms land with the organizations and the oracle roles, each with its Oracle Proof Link, with the assets. Pass it to every stage; without it no oracle role is written.
- `--export-patches <path>` applies the `export:<id>` rows and the oracle map of a batch file or folder over the exports first.
- `--dry-run` lands the stage in memory and writes only the report.
- A stage run twice changes nothing: each add command refuses a key the registry holds, and migrate counts that row as already there, not as held.

## Apply

A batch is a csv with the columns `file,path,old,new,source,fetchedAt,agent,verified`, as `set` and the import write them.

- A value row lands through `set`. Its path may name a field as the import's staged row did (`redeemable`, `links.twitter`) or as the file holds it (`terms.redeemable`); a staged file such as `reference/organizations/<slug>.json` is found by its slug.
- A row whose `old` is not the value in the file is held as stale. A row whose value is in place already is left, so a batch applied twice changes nothing.
- A row whose path is `fold` or `merge` lands through `merge`, dropping the file's row into `target`, or into `new` when there is no target column. A `decision` other than `confirmed` holds it.
- The rows of one `acks/<slug>.json` file land together through `ack`. An ack file without `until` lands open-ended.
- A `kind` row on an organization, or a `class` row on an underlying, lands through `set`, which moves the file to the folder of the new kind or class.
- The `export:<id>` rows and the oracle map land first, given `--markets` and `--platforms`: the exports are mapped once at the old cells and once at the new, and each difference lands through its stage's add command, `add value`, `add rule` or `set`. A file the new cells no longer write is left in place, and the report names it. Without the exports each export row is held.
- Every row needs a source, and a value or ack row the day it was read. They go to the patch csv in `patches/`, as `set` writes them.

## One commit per stage

Commit after each stage and after each batch, so each diff is what that step changed. Push the stage commits together onto the empty main: CI validates a push against the registry before it, and an empty registry counts as none, so the sheet rows are not new rows there.

## A held row

`<out>/held-<stage>.csv` and `held-<batch>.csv` list each held row with its reason, and the report groups them by cause.

- Fix the cause, never the file around the check: add a missing organization, value or rule with its add command or a batch; give a stale batch row the value the file holds as its `old`.
- Run the stage or the batch again. It lands only the rows that are not there yet and leaves the rest.
