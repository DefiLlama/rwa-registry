# Operations

## Checks and release

| Workflow      | Runs on            | Steps                                                                |
| ------------- | ------------------ | -------------------------------------------------------------------- |
| `pr.yml`      | every pull request | install from the lockfile, `validate`, typecheck, test, format check |
| `release.yml` | every push to main | the same checks, then `build --commit <sha>`, then publish           |

The release replaces `registry.json` on the GitHub release tagged `latest` and publishes no other file. A failed release posts one line to Discord through the repository secret `RWA_REGISTRY_DISCORD_WEBHOOK`; without the secret the job only logs that no line was sent. Nothing runs on a schedule, so the registry changes only through pull requests.

## Environment variables

No command needs a key. `config/discover.json` writes every key as an `<ENV_NAME>` placeholder, and only `discover`, `add asset` and `add market` read one, to date a deployment or a listing. Without a key, a read falls back to a slower source or answers null with a reason, and the run starts with one line per missing key. Export the keys you hold in the shell, since no command reads a file.

| Variable            | What for                                                                         |
| ------------------- | -------------------------------------------------------------------------------- |
| `ETHERSCAN_API_KEY` | EVM contract creation dates.                                                     |
| `ALCHEMY_KEY`       | Past EVM state and Solana history, beyond the public nodes.                      |
| `TONCENTER_API_KEY` | TON deployment dates.                                                            |
| `SOLSCAN_API_KEY`   | Solana mint creation times, one call per mint.                                   |
| `PRO_API_KEY`       | The first stored day from the RWA chart, for a deployment no other source dates. |

Chain reads go through `@defillama/sdk`, which takes its RPC endpoints from its own variables, such as `ETHEREUM_RPC`; without them it uses public nodes, which are slow and keep little history.
The rest of `discover` in `config/discover.json` holds each source's `concurrency`, `minIntervalMs` and `timeoutMs`; lower `concurrency` for a source that answers `rate-limited`. `sources.http` holds the request and connect timeouts, 30 s each, and `venues` the four exchange APIs the listing dates come from.
