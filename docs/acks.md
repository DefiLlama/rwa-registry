# Acks

An ack is an accepted exception to a server guard: it says why an alert or a block is fine, and which step ends it.

Acks live in `registry/acks/<kind>/<slug>.json`. `validate` checks them, and `registry.json` carries them in its `ack` table.

## Kinds

| Kind                 | Target   | Effect on the server                                                    |
| -------------------- | -------- | ----------------------------------------------------------------------- |
| `asset-move`         | asset    | Mutes the alert of a move the guard blocks correctly; the block stays.  |
| `asset-move-release` | asset    | Lets one verified move through, once.                                   |
| `flows-hidden`       | asset    | Holds the asset out of every flow series.                               |
| `single-point`       | asset    | A first-day listing under its ceiling does not block the chart publish. |
| `aggregate-jump`     | asset    | A verified step up on one day does not block the chart publish.         |
| `head-move`          | series   | Silences the head-move finding for the day its episode started.         |
| `drift`              | series   | Silences a rewrite you ran, or a vanished series file.                  |
| `perps-venue`        | venue    | Drops a venue from the perps coverage report.                           |
| `perps-market`       | contract | Drops a market that is not RWA from the perps coverage report.          |

> An asset that redeemed to 0 USD for good gets a `retirement` event, not an ack.

## Fields

Every ack holds `slug`, its target, `reason` (the evidence) and `resolve` (the step that ends it).

| Kind                 | Other fields                                                                   |
| -------------------- | ------------------------------------------------------------------------------ |
| `asset-move`         | `from`, `until`, `metrics`, `direction`, `maxCurrentUsd`, `minPreviousUsd`     |
| `asset-move-release` | `from`, `until`, `metrics`, `direction`, `currentUsd` and `previousUsd` ranges |
| `flows-hidden`       | `from`, `until`                                                                |
| `single-point`       | `from`, `until`, `maxValueUsd`                                                 |
| `aggregate-jump`     | `day`, the later day of the step                                               |
| `head-move`          | `day`, the day the episode started                                             |
| `drift`              | `firstDay` and `lastDay`; without them it covers a vanished series file        |
| `perps-venue`        | `from`, `until`                                                                |
| `perps-market`       | `from`, `until`; the contract is `<venue>:<symbol>`, lowercased                |

- `from` and `until` are the ack's own life. `until: null` holds until the resolve step is done.
- `day`, `firstDay` and `lastDay` are series days.
- The slug is the target, plus the day for `aggregate-jump`, `head-move` and `drift`: `acks/aggregate-jump/tbill-2026-09-07.json`. Series `*` is `every-series`.

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

## Commands

`pnpm rwa ack <kind> <target>` writes one ack. `ack --help` lists each kind's flags.

```sh
pnpm rwa ack flows-hidden brz --from 2026-09-03 --reason "..." --resolve "..."
pnpm rwa ack aggregate-jump tbill --day 2026-09-07 --reason "..." --resolve "..."
pnpm rwa ack drift chain/ethereum --first-day 2026-10-01 --last-day 2026-10-02 --reason "..." --resolve "..."
```

> An `asset-move` ack left without a band takes the band of every master ack: a drop to under 1,000 USD from at least 100,000 USD.

To end an ack, delete its file, or set its last day:

```sh
pnpm rwa set registry/acks/<kind>/<slug>.json until <date>
```
