---
title: status
description: Show relay, server, and manifest history details for a site
---

# status

Inspect a deployed site's relay coverage, Blossom server availability, and
manifest history. Without `--full`, the command prints a per-server progress
bar showing how many of the manifest's files are reachable on each Blossom
server (split into manifest-hint servers and additional user servers); with
`--full`, the same per-server availability is rendered next to the full file
tree. The optional positional `[path]` filters the file list to a directory or
exact path.

## Usage

```bash
nsyte status [path] [options]
```

## Arguments

- `[path]` — Optional path filter. Can be a directory (e.g. `assets/`) or an
  exact file path. When omitted, every file in the manifest is included.

## Options

- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec,
  bunker:// URL, or 64-char hex)
- `-p, --pubkey <npub>` — The public key to inspect (npub, hex, or NIP-05
  identifier like `name@domain.com`)
- `-d, --name <name>` — The site identifier for named sites (kind 35128). If
  not provided, inspects the root site (kind 15128)
- `--no-config` — Ignore config file and use only CLI arguments (default:
  `false`)
- `--full` — Show the full file list instead of the per-server file summary
  (default: `false`)
- `--use-fallback-relays` — Include default nsyte relays in addition to
  configured/user relays
- `--use-fallbacks` — Enable all fallbacks (currently only relays for this
  command)

## Examples

Show a per-server summary for the current project's root site:

```bash
nsyte status
```

Inspect another user's site by public key:

```bash
nsyte status -p npub1exampleexampleexampleexampleexample
```

Show the full file tree with per-file server availability:

```bash
nsyte status --full
```

Filter to a single directory:

```bash
nsyte status assets/
```

## See Also

- [`nsyte debug`](debug.md) — Lower-level relay/event inspection
- [`nsyte ls`](ls.md) — List files in a site manifest
- [`nsyte sites`](sites.md) — List all sites belonging to a public key

Inherits global options. See [global options](_global-options.md).
