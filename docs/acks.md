# Acks

An ack is one accepted exception to a server guard: the guard would alert on, block or report something, and the ack says why that is fine and which step ends it. Acks sit beside `registry/` in `acks/<kind>/<slug>.json`, one file each, since an exception is not a fact about a row. `validate` checks them with the registry, and `registry.json` carries them in its `ack` table, each row with the `kind` its folder names.

## The kinds

| Kind                 | Target   | What it does on the server                                                                         |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `asset-move`         | asset    | Mutes the repeating alert of a move the asset-move guard blocks correctly; the block stays.        |
| `asset-move-release` | asset    | Lets one verified move the guard blocks wrongly write through, once.                               |
| `flows-hidden`       | asset    | Holds the asset out of every flow series, its own and the aggregates.                              |
| `single-point`       | asset    | A listing on its first day, under its value ceiling, does not block the aggregate chart publish.   |
| `aggregate-jump`     | asset    | The asset's verified step up on one day does not block the aggregate chart publish.                |
| `head-move`          | series   | Silences the head-move finding of one series for the day its episode started.                      |
| `drift`              | series   | Silences a rewrite of a series' days that you ran, or a vanished series file when no days are set. |
| `perps-venue`        | venue    | Drops a whole venue from the perps coverage report.                                                |
| `perps-market`       | contract | Drops one market that is not RWA from the perps coverage report.                                   |

A kind with no file has no folder; the first `ack` of that kind makes it. A folder that is no kind fails `validate`.
An asset that redeemed to 0 USD and stays there is no ack but a `retirement` event on its asset file.

## The file of each kind

Every file holds `slug`, its target, `reason` and `resolve`. The reason names the evidence: the page, the API answer, the on-chain read or the issuer note that shows the exception is right. `from` and `until` are the ack's own life, the day it was made and the last day it holds, and `until: null` holds until the resolve step is done. `day`, `firstDay` and `lastDay` are series days, never the ack's life.

| Kind                 | Fields beside slug, target, reason and resolve                                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asset-move`         | `from`, `until`, and the band: `metrics` (`onChainMcap`, `activeMcap`), `direction` (`up` or `down`), `maxCurrentUsd`, `minPreviousUsd`. It mutes only while every blocked trip is one of the metrics, moves that way, lands at or under `maxCurrentUsd` and comes from at least `minPreviousUsd`. |
| `asset-move-release` | `from`, `until`, `metrics`, `direction`, and `currentUsd` and `previousUsd` as `[low, high]`. `previousUsd` brackets the frozen baseline, so once the write lands the release matches nothing, even with `until: null`.                                                                            |
| `flows-hidden`       | `from`, `until`.                                                                                                                                                                                                                                                                                   |
| `single-point`       | `from`, `until`, `maxValueUsd`, the ceiling the single-point value stays under.                                                                                                                                                                                                                    |
| `aggregate-jump`     | `day`, the later day of the step, the row the jump is reported on. Only a step up is excused, never a drop on that day.                                                                                                                                                                            |
| `head-move`          | `day`, the day the episode started.                                                                                                                                                                                                                                                                |
| `drift`              | `firstDay` and `lastDay`, inclusive, given together; without them the ack covers a vanished series file. Series `*` covers every series.                                                                                                                                                           |
| `perps-venue`        | `from`, `until`.                                                                                                                                                                                                                                                                                   |
| `perps-market`       | `from`, `until`; the contract is `<venue>:<symbol>`, lowercased.                                                                                                                                                                                                                                   |

The slug is the target, with the day for `aggregate-jump` and `head-move` and the first day for `drift`: `acks/aggregate-jump/tbill-2026-09-07.json`, `acks/head-move/chain-robinhood-chain-2026-10-15.json`. A series or a contract is lowercased with every other run of characters one hyphen, and `*` is `every-series`.

```json
{
  "slug": "fiusd",
  "asset": "fiusd",
  "from": "2026-09-03",
  "until": null,
  "metrics": ["onChainMcap", "activeMcap"],
  "direction": "down",
  "maxCurrentUsd": 1000,
  "minPreviousUsd": 100000,
  "reason": "FIUSD price-feed gap; blocked correctly, value frozen.",
  "resolve": "remove when the asset is priced again"
}
```

## The command

`pnpm rwa ack <kind> <target>` writes one file. `pnpm rwa ack --help` lists the flags of each kind and the default band of an `asset-move`, and a flag the kind does not take is refused.

```
pnpm rwa ack flows-hidden brz --from 2026-09-03 --reason "BRZ phantom mcap, about 1e17 spikes" --resolve "drop when the stablecoins API mcap for BRZ is sane"
pnpm rwa ack asset-move-release thbill --from 2026-10-28 --metrics activeMcap --direction up --current 11000000:14000000 --previous 1400000:1800000 --reason "..." --resolve "..."
pnpm rwa ack aggregate-jump tbill --day 2026-09-07 --reason "..." --resolve "..."
pnpm rwa ack drift chain/ethereum --first-day 2026-10-01 --last-day 2026-10-02 --reason "a refill you ran" --resolve "..."
pnpm rwa ack perps-venue bitget --from 2026-10-02 --reason "..." --resolve "..."
```

To end an ack, set its last day with `pnpm rwa set ../acks/<kind>/<slug>.json until <date>`, the path given from the registry folder, or delete the file.
