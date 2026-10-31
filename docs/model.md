# Model

The registry holds static facts in 11 tables, defined in `src/schema/`. The server computes every number from them.

A file groups its fields in blocks ([registry.md](registry.md)). `registry.json` holds flat rows with the field names below.

## Tables

| Table           | Key                                | One row is                                             |
| --------------- | ---------------------------------- | ------------------------------------------------------ |
| `vocabulary`    | vocabulary and `slug`              | a value of a closed list                               |
| `organization`  | `slug`                             | a firm or brand: platform, issuer, oracle and others   |
| `underlying`    | `slug`                             | an economic exposure: Tesla stock, gold, the US dollar |
| `venue`         | `slug`                             | an exchange, perps protocol or HIP-3 dex               |
| `asset`         | `slug`                             | a token class across all its chains                    |
| `deployment`    | `chain:address`                    | an asset on one chain                                  |
| `perp_market`   | `venue:symbol`                     | a perps market on a venue                              |
| `role`          | organization, kind, target, `from` | an organization's role on a row                        |
| `event`         | target, kind, `date`               | a dated change to a row                                |
| `address_label` | deployment and address             | a holder left out of active supply                     |
| `ack`           | `kind/slug`                        | an exception to a server guard ([acks.md](acks.md))    |

> A table points only at tables above it. A self-reference (`parent`, `wraps`) may not loop.

## Keys

- A slug holds lowercase letters, digits and hyphens. A rename keeps the slug.
- A missing value is `null`, never `0`.
- `legacyId` (asset, market) and `legacyPid` (organization) are the app's RWA ID and PID. They never change.
- A new asset gets the next legacy id, never below 9718. A new market or organization gets none.
- A role or an event names its target as `{ table, key }`.

## Deployments and chains

- A deployment with `address: null` lists a chain with no known contract. `validate` warns until it has one.
- `deployedAtBasis` says where `deployedAt` came from: a chain record (`contract-creation`, `first-code`, `first-signature`), a page (`issuer-announcement`, `explorer-page`), or `first-stored-day`, which is not a launch date.
- A chain is its `@defillama/sdk` key (`ethereum`, `plume_mainnet`), else its name in lowercase with hyphens.
- A chain the sdk does not know is listed but not read. `validate` warns `unknown-chain`.

## Taxonomy

| Layer     | On            | Vocabulary  | Example                              |
| --------- | ------------- | ----------- | ------------------------------------ |
| Exposure  | underlying    | asset-group | `tesla-inc` is public-equities       |
| Structure | asset, market | asset-class | stock-backed; stock-perp on a market |
| Category  | asset         | category    | stocks-equities, the main one first  |

- An asset group names a `class`, and the underlying's folder is that class.
- An underlying has one `name`, its legal name. `merge` keeps a dropped name in its merge event.

## Organizations

An organization's `kind` decides where its file lives:

- platform: `assets/<platform>/platform.json`
- venue operator: `perps/<venue>/organization.json`
- any other kind: `reference/organizations/<kind>/<slug>.json`

Only platforms and venue operators hold the `platform` block (categories, asset classes, chains, fees) and the `review` block. `parent` names the organization it belongs to.

## Vocabularies

One closed list per file in `reference/vocabularies/`. A value has a `slug` and a `label`, and the slug is `rwaSlug(label)`: `Stocks & Equities` is `stocks-equities`.

> A list the app never shows (address family, review outcome, ack kind) is an enum in the code, not a vocabulary.

## Events

| Kind                               | Targets                            | Effect                                              |
| ---------------------------------- | ---------------------------------- | --------------------------------------------------- |
| `listing`, `delisting`             | asset, market, venue, organization | Set `delisted` and the status.                      |
| `review`                           | asset, market, venue, organization | Sets `suspicious`; a suspicious one needs a reason. |
| `retirement`                       | asset, deployment, market          | Ends the target; needs a reason.                    |
| `migration`                        | asset, deployment                  | Ends the target; may name a `successor`.            |
| `split`                            | market                             | Ends the target; may name a `successor`.            |
| `maturity`                         | asset                              | Ends the target.                                    |
| `paused`, `resumed`                | asset, market, venue, organization | Unpublish or publish a venue.                       |
| `merge`                            | organization, underlying           | Written by `merge`.                                 |
| `roll`, `attestation`, `wind-down` | market; asset, organization        | A dated note.                                       |

- An event with no date counts as having happened.
- The server reads no delisted or ended asset, and no ended deployment.

## Review flags

Assets, markets, venues, platforms and venue operators hold `suspicious` and `delisted` in a `review` block.

- `delisted` is true when the latest listing or delisting event is a delisting.
- `suspicious` is true when the latest review found the row suspicious.
- Every write sets both from the events, and `validate` fails a flag that disagrees.
- A retired row keeps its `delisted` value. Its status is `retired`.

## Derived fields

`build` adds these to `registry.json`, so the server never computes them.

| Field                      | On                                 | From                                                                                                |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `primaryChain`             | asset                              | the `primary` deployment's chain, else the platform's                                               |
| `issuerProtocolIds`        | asset                              | the issuer roles' `protocolIds`, else the asset's                                                   |
| `stablecoin`, `governance` | asset                              | the flags of its category, asset class and RWA classification; an override with a `flagReason` wins |
| `kind`                     | asset                              | `governance`, else `stablecoin`, else `claim`                                                       |
| `chains`                   | asset                              | the chains of its deployments that have not ended                                                   |
| `id`                       | market                             | `venue:symbol`, lowercase                                                                           |
| `status`                   | asset, market, venue, organization | `retired` after an ending event, else `delisted` or `listed`                                        |
