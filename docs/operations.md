# Operations

## Checks and release

| Workflow      | Runs on            | Steps                                                                                                            |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `pr.yml`      | every pull request | install from the lockfile, `validate --base` against the target branch's registry, typecheck, test, format check |
| `release.yml` | every push to main | the same checks against the previous commit, then `build --commit <sha>`, then publish                           |

The release replaces `registry.json` on the GitHub release tagged `latest` and publishes no other file. A failed release posts one line to Discord through the repository secret `RWA_REGISTRY_DISCORD_WEBHOOK`; without the secret the job only logs that no line was sent. Nothing runs on a schedule, so the registry changes only through pull requests.

## Review and merge

`CODEOWNERS` names `gultekinmakif` as the owner of `src/`, `config/`, `.github/` and the vocabularies, so a change there asks for that review. A pull request that only changes data files merges on green CI.

## Environment variables

No command needs a key. `config/discover.json` writes every key as an `<ENV_NAME>` placeholder, and only `discover`, `add asset` and `add market` read one, to date a deployment or a listing. Without a key, a read falls back to a slower source or answers null with a reason, and the run starts with one line per missing key. `.env.example` at the root lists the five, empty; export the ones you hold in the shell, since no command reads a file.

| Variable            | Used by                             | What for                                                                         |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `ETHERSCAN_API_KEY` | `discover.sources.etherscan.apiKey` | EVM contract creation dates.                                                     |
| `ALCHEMY_KEY`       | `discover.sources.alchemy.apiKey`   | Past EVM state and Solana history, beyond the public nodes.                      |
| `TONCENTER_API_KEY` | `discover.sources.toncenter.apiKey` | TON deployment dates.                                                            |
| `SOLSCAN_API_KEY`   | `discover.sources.solscan.apiKey`   | Solana mint creation times, one call per mint.                                   |
| `PRO_API_KEY`       | `discover.sources.history.apiKey`   | The first stored day from the RWA chart, for a deployment no other source dates. |

Chain reads go through `@defillama/sdk`, which takes its RPC endpoints from its own variables, such as `ETHEREUM_RPC`; without them it uses public nodes, which are slow and keep little history.
The rest of `discover` in `config/discover.json` holds each source's `concurrency`, `minIntervalMs` and `timeoutMs`; lower `concurrency` for a source that answers `rate-limited`. `sources.http` holds the request and connect timeouts, 30 s each, and `venues` the four exchange APIs the listing dates come from. The keys the server's crons need live in the server's environment.

## The parallel run

Until the cutover, a second deployment of the server runs the registry pipeline beside the Airtable pipeline, into its own `_registry` tables and cache folders, so the published API still comes from Airtable. A diff compares the two outputs field by field and classes each difference as equal, allowed, computed, lost, new or wrong. An allow-list names each accepted difference with its evidence, and an entry that matches nothing for seven days is reported as stale. At the cutover the server reads only the registry and the second deployment is switched off.
