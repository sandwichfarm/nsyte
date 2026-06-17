---
title: napp
description: Manage napp (NIP-5B) discoverable-app publishing
---

# napp

A napp is a [NIP-5A](https://github.com/nostr-protocol/nips) nsite that supports
NIP-07 (`window.nostr`) and is advertised as a discoverable app via a kind-37348
App Listing ([NIP-5B](https://github.com/nostr-protocol/nips/pull/2282)). The
`nsyte napp` command manages the napp-specific deltas on top of normal nsite
publishing.

## Usage

```bash
nsyte napp <subcommand> [options]
```

## Deploy auto-publishes the listing

When `.nsite/config.json` contains a valid `napp` section, `nsyte deploy` prints
an info line and publishes the kind-37348 App Listing (to the deduped union of
your NIP-65 write relays and the configured indexer relays) with no extra flags.
See [`nsyte deploy`](deploy.md).

## Config (`napp` section)

The `napp` section of `.nsite/config.json` describes the listing:

- `name` — display name (`{ value, lang? }`).
- `icon` — app icon asset (`{ hash, mime }`).
- `categories` — 1–3 `napp.<cat>:<sub>` labels (validated against the fixed
  NIP-5B table).
- `countries` — `*` (worldwide) or a list of ISO 3166-1 alpha-2 codes.
- Optional: `summary`, `description`, `self`, `keyart`, `screenshots`, `tags`,
  `indexerRelays`.

See the [configuration reference](../configuration.md) for the full schema.

## Subcommands

- `id` — Print the shareable `+` app identifier for this napp.
- `release` — Publish a kind-39108 changelog for the current app version.
- `init` — Retrofit a `napp` section onto an existing project's config
  (interactive, or fully scriptable via flags).
- `validate` — Check napp readiness: required fields, categories, and a NIP-07
  heuristic.

## id Arguments

`id` takes no arguments beyond the global options.

## id Options

`id` takes no options beyond the global options.

## release Options

- `--sec <secret>` — key (nsec/hex, nbunksec, or `bunker://`) to sign the
  release note with.
- `--relays <relays>` — comma-separated relay URLs (overrides config).
- `--pubkey <pubkey>` — public key (hex/npub) to resolve the manifest for.
- `--fix <text>` — bug-fix changelog entry (repeatable).
- `--add <text>` — added-feature changelog entry (repeatable).
- `--try <text>` — experimental changelog entry (repeatable).
- `--cut <text>` — removed-feature changelog entry (repeatable).
- `--sub <text>` — generic changed/substitute changelog entry (repeatable).

## init Options

`init` retrofits a `napp` section onto an existing project's config. With no
flags it prompts interactively; flags pre-fill answers (fully-specified flags
skip prompts entirely), and missing fields are prompted for — or, when
non-interactive (`--yes` or no TTY), reported as an error and the command exits
non-zero rather than hanging.

- `--name <name>` — app display name.
- `--icon <icon>` — app icon: a sha256 hash, a URL, OR a local file path. Local
  files are uploaded to your configured blossom servers (requiring `--sec` or a
  stored bunker); the resulting sha256 + MIME are captured.
- `--icon-mime <mime>` — icon MIME type for hash/URL icon inputs (default
  `image/png`).
- `--category <label>` — `napp.<cat>:<sub>` category label (repeatable, max 3; a
  bare `<cat>:<sub>` is normalized to `napp.<cat>:<sub>`).
- `--countries <csv>` — comma-separated ISO 3166-1 alpha-2 codes, or `*` for
  worldwide.
- `--summary <text>` — short summary.
- `--description <text>` — long description.
- `--keyart <keyart>` — key art asset: a sha256 hash, a URL, or a local file
  path (uploaded like `--icon`).
- `--screenshot <shot>` — screenshot asset: a sha256 hash, a URL, or a local
  file path (repeatable; uploaded like `--icon`).
- `--self <pubkey>` — author pubkey (64-hex).
- `--tag <tag>` — free-form tag (repeatable).
- `--indexer-relay <relay>` — indexer relay URL the listing is also published to
  (repeatable).
- `--id <id>` — set a named-site identifier. napps need a NAMED site to be
  discoverable; setting an id republishes the manifest from kind 15128 (root) to
  kind 35128 (named) and orphans the old root manifest. This is OPT-IN — nsyte
  never auto-migrates. On a root site with neither `--id` nor an interactive
  confirmation, the napp section is still written but the id stays unset (and
  `nsyte napp id` will not work until it is set).
- `--sec <secret>` — key (nsec/hex, nbunksec, or `bunker://`) used to sign
  local-file asset uploads. Not needed when all assets are hashes/URLs.
- `--yes` — non-interactive: never prompt; error and exit non-zero if required
  fields (`--name`, `--icon`, `--category`) are missing.

## validate Arguments

- `[dir]` — optional directory to scan for NIP-07 evidence (default: current
  directory).

## validate Options

`validate` takes no options beyond the global options.

`validate` semantics: structural errors fail (non-zero exit); a missing NIP-07
signal is a WARNING only (exit stays `0`).

Inherits global options. See [global options](_global-options.md).
