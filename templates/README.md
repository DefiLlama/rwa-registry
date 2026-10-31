# Templates

One file per `add` command, laid out like the file it writes.

1. Copy one: `cp templates/asset.json ionqx.json`
2. Fill it in.
3. Check it: `pnpm rwa add asset --from ionqx.json --dry-run`
4. Write it: `pnpm rwa add asset --from ionqx.json`

## Filling one

- Replace every example value. A `null` field is optional, and an unused list stays `[]`.
- Leave `slug`, `legacyId` and `legacyPid` null, and the command assigns them.
- A vocabulary field takes a slug from `registry/reference/vocabularies/`.
- A row a field names must exist first, such as the platform before its assets.
- In a terminal, the command asks for what the file leaves empty.

## Files

| Template                | Command            | Notes                                                                             |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `asset.json`            | `add asset`        | Needs one issuer role. A deployment without `deployedAt` is dated from its chain. |
| `platform.json`         | `add platform`     |                                                                                   |
| `organization.json`     | `add organization` | `kind` names the folder.                                                          |
| `venue.json`            | `add venue`        | Fill `operator` to add a new operator beside the venue.                           |
| `market.json`           | `add market`       | Leave `events` empty to take the venue's listing date.                            |
| `underlying.json`       | `add underlying`   | The folder is the class of `exposure`.                                            |
| `vocabulary-value.json` | `add value`        | Added in slug order.                                                              |
