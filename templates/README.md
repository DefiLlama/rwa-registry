# Templates

Each file here is one row an `add` command writes, laid out as its file: the same blocks, every field in schema order. Copy the file, fill it, and pass the copy with `--from`:

```
cp templates/asset.json ionqx.json
pnpm rwa add asset --from ionqx.json --dry-run
pnpm rwa add asset --from ionqx.json
```

## Filling one

- Replace every example value. A field that holds `null` is optional, and a list you do not need stays `[]`.
- `slug`, `legacyId` and `legacyPid` may stay null where the template has them null, and the command assigns them: the slug from the name, label or canonical market id, and the legacy id as `docs/model.md` says. A filled one is kept, and the unique-key check refuses one another row holds, naming it.
- A vocabulary field takes a slug from `registry/reference/vocabularies/`. A value that is not there is refused, and the message names the nearest one.
- A row a field names must exist first: the platform before its assets, the underlying before an asset or market that tracks it, the venue before its markets, and the organization before a role or venue names it.
- A key the schema does not know is refused.
- `review.suspicious` and `review.delisted` may stay false: the write sets both from the template's `events` (`docs/model.md`).

## The files

| Template                | Command            | Writes                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asset.json`            | `add asset`        | `assets/<platform>/<slug>.json`              | `platform` names the folder and is left out of the file. A deployment without `deployedAt` is dated from the chain; under `--no-discover` it stays undated and `validate` warns until the date is set. Only `--from` gives a deployment with `address: null`, since `--deployment` takes `<chain>:<address>`. `roles` needs one issuer; the other roles, the holder label and the event are examples. |
| `platform.json`         | `add platform`     | `assets/<slug>/platform.json`                |                                                                                                                                                                                                                                                                                                                                                                                                       |
| `organization.json`     | `add organization` | `reference/organizations/<kind>/<slug>.json` | `kind` names the folder. A platform goes through `platform.json`, a venue operator through `add venue`.                                                                                                                                                                                                                                                                                               |
| `venue.json`            | `add venue`        | `perps/<slug>/venue.json`                    | Its organization must exist, or `operator` is filled with its `slug`, `name` and `links` and written beside the venue as `perps/<slug>/organization.json` of kind venue-operator.                                                                                                                                                                                                                     |
| `market.json`           | `add market`       | `perps/<venue>/<lowercase symbol>.json`      | `venue` names the folder. Leave `events` empty, and the command asks the venue for the listing date.                                                                                                                                                                                                                                                                                                  |
| `underlying.json`       | `add underlying`   | `reference/underlyings/<class>/<slug>.json`  | The folder is the class the asset group of `exposure` names, so the file holds no `class`.                                                                                                                                                                                                                                                                                                            |
| `vocabulary-value.json` | `add value`        | `reference/vocabularies/<vocabulary>.json`   | Added in slug order.                                                                                                                                                                                                                                                                                                                                                                                  |
