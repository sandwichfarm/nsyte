---
title: napp
description: Manage napp (NIP-5B) discoverable-app publishing
---

# napp

A napp is a [NIP-5A](https://github.com/nostr-protocol/nips) nsite that supports NIP-07
(`window.nostr`) and is advertised as a discoverable app via a kind-37348 App Listing
([NIP-5B](https://github.com/nostr-protocol/nips/pull/2282)). The `nsyte napp` command
manages the napp-specific deltas on top of normal nsite publishing.

## Usage

```bash
nsyte napp <subcommand> [options]
```

## Deploy auto-publishes the listing

When `.nsite/config.json` contains a valid `napp` section, `nsyte deploy` prints an info
line and publishes the kind-37348 App Listing (to the deduped union of your NIP-65 write
relays and the configured indexer relays) with no extra flags. See
[`nsyte deploy`](deploy.md).

## Config (`napp` section)

The `napp` section of `.nsite/config.json` describes the listing:

- `name` — display name (`{ value, lang? }`).
- `icon` — app icon asset (`{ hash, mime }`).
- `categories` — 1–3 `napp.<cat>:<sub>` labels (validated against the fixed NIP-5B table).
- `countries` — `*` (worldwide) or a list of ISO 3166-1 alpha-2 codes.
- Optional: `summary`, `description`, `self`, `keyart`, `screenshots`, `tags`,
  `indexerRelays`.

See the [configuration reference](../configuration.md) for the full schema.

## Subcommands

- `id` — Print the shareable `+` app identifier for this napp.
- `release` — Publish a kind-39108 changelog for the current app version.
- `init` — Retrofit a `napp` section onto an existing project's config (interactive).
- `validate` — Check napp readiness: required fields, categories, and a NIP-07 heuristic.

## id Arguments

`id` takes no arguments beyond the global options.

## id Options

`id` takes no options beyond the global options.

## release Options

- `--sec <secret>` — key (nsec/hex, nbunksec, or `bunker://`) to sign the release note with.
- `--relays <relays>` — comma-separated relay URLs (overrides config).
- `--pubkey <pubkey>` — public key (hex/npub) to resolve the manifest for.
- `--fix <text>` — bug-fix changelog entry (repeatable).
- `--add <text>` — added-feature changelog entry (repeatable).
- `--try <text>` — experimental changelog entry (repeatable).
- `--cut <text>` — removed-feature changelog entry (repeatable).
- `--sub <text>` — generic changed/substitute changelog entry (repeatable).

## init Options

`init` is interactive and takes no options beyond the global options.

## validate Arguments

- `[dir]` — optional directory to scan for NIP-07 evidence (default: current directory).

## validate Options

`validate` takes no options beyond the global options.

`validate` semantics: structural errors fail (non-zero exit); a missing NIP-07 signal is
a WARNING only (exit stays `0`).

Inherits global options. See [global options](_global-options.md).
