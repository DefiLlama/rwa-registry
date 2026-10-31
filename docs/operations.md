# Operations

How to do each task with `pnpm rwa`.

- A command that writes checks the result on a copy first, and writes nothing on an error.
- `--dry-run` prints the files without writing them.
- In a terminal, a command asks for what you did not pass. `--no-input` asks nothing.

## Add a row

Add rows in this order, since each one needs the rows before it:

1. `add value`: a value of a vocabulary.
2. `add organization`: an issuer, oracle, auditor or other firm.
3. `add underlying`: the exposure an asset or market tracks.
4. `add platform`: an issuer's asset folder.
5. `add asset`: a token, with its deployments and roles.
6. `add venue`: a perps venue.
7. `add market`: a perps market on a venue.

```sh
pnpm rwa add organization --name "Backed Assets (JE) Limited" --kind issuer
pnpm rwa add underlying --name "Tesla, Inc." --exposure public-equities --ticker TSLA
pnpm rwa add platform --name "Backed Finance"
pnpm rwa add venue --name Hibachi --venue-type dex --access-model permissionless --rwa-classification programmable-finance --adapter hibachi
pnpm rwa add market --venue xyz --symbol TSLA --tracks tesla-inc --structure stock-perp
```

- `add asset` dates each deployment from its chain. With `--no-discover` it stays undated, and `validate` warns until it is set.
- `add market` takes the listing date from the venue's API (Binance, Bybit, OKX, Gate).
- `add venue` writes a new operator beside the venue. The venue stays unpublished until its server adapter is merged.
- `--from <file>` reads a filled template instead ([templates/README.md](../templates/README.md)).

## Delist, relist, pause, resume, review

```sh
pnpm rwa delist asset tslax --at 2026-10-30 --reason "Redeemed in full" --source <url>
pnpm rwa review asset tslax --outcome suspicious --reason "Supply doubles the issuer's report" --source <url>
```

| Command  | Adds              | And                     |
| -------- | ----------------- | ----------------------- |
| `delist` | a delisting event | sets `delisted`         |
| `relist` | a listing event   | clears `delisted`       |
| `pause`  | a paused event    | unpublishes a venue     |
| `resume` | a resumed event   | publishes a venue again |
| `review` | a review event    | sets `suspicious`       |

- The target is `asset <slug>`, `market <venue>:<symbol>`, `venue <slug>` or `platform <slug>`.
- `--at` may not be after today, or before a later event of the same flag.
- A suspicious review needs `--reason`. A cleared review is taken at any time.

## Ack

`pnpm rwa ack <kind> <target>` writes an exception to a server guard ([acks.md](acks.md)).

## Set a field

```sh
pnpm rwa set registry/assets/xstocks/tslax.json terms.redeemable true
```

- The value is read by the field's type. `unknown` sets null, and a list is comma-separated.
- `--file <json>` replaces the whole file.
- `set <file> kind <kind>` moves an organization to the folder of its new kind.

## Merge

```sh
pnpm rwa merge organization <keep> <drop> --reason "<why>" --source <url>
```

- Moves every reference from drop to keep, keeps drop's name in a `merge` event, and removes drop's file.
- Merging two platforms moves drop's assets into keep's folder.
- A row with a legacy PID needs `--force`.

## Discover

```sh
pnpm rwa discover address solana:<mint>
pnpm rwa discover dates --platform xstocks --dry-run
```

- `discover address` prints what the chain says about a token, and writes nothing.
- `discover dates` fills missing deployment dates from the chains, and listing dates from the venues.
- Narrow a run with `--platform`, `--chain`, `--venue` and `--limit`.

> `discover` never writes DefiLlama's first stored day as a deployment date.

### Keys

No key is required. Each makes a source faster or reach further.

| Key                 | Gives                             |
| ------------------- | --------------------------------- |
| `ETHERSCAN_API_KEY` | EVM deployment dates in one call  |
| `ALCHEMY_KEY`       | past EVM state and Solana history |
| `SOLSCAN_API_KEY`   | Solana mint dates in one call     |
| `TONCENTER_API_KEY` | a higher TON rate limit           |

Set a key in the shell or in `.env` at the repository root; `.env.example` lists them. Sources and pacing are in `config/discover.json`, and RPC endpoints come from the sdk's variables, such as `ETHEREUM_RPC`.

## Validate and build

```sh
pnpm rwa validate
pnpm rwa build --commit local
```

- `validate` exits 1 on an error ([registry.md](registry.md#checks)).
- `build` writes `dist/registry.json`, with each status derived at today or `--at`.

## Release

Merge the pull request into main. `release.yml` runs the checks again, builds `registry.json` and replaces it on the `latest` release.

> A failed release posts to Discord through the `RWA_REGISTRY_DISCORD_WEBHOOK` secret.
