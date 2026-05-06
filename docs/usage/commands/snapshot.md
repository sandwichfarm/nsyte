---
title: snapshot
description: Create an immutable snapshot event for the current root or named site
---

# snapshot

Publish an immutable snapshot event (kind 5128) that pins the current state of
the root or a named site at a specific moment. The snapshot is built from the
current site manifest's aggregate hash and contents, so future readers can
verify they are looking at the same blob set the snapshot was made from. Unlike
the regular site manifest, a snapshot event is not meant to be replaced — each
publish records a new historical point.

## Usage

```bash
nsyte snapshot [options]
```

## Options

- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec,
  bunker:// URL, or 64-char hex)
- `-d, --name <name>` — The site identifier for named sites (kind 35128). If not
  provided, snapshots the root site (kind 15128)
- `--dry-run` — Preview the snapshot event without signing or publishing it
- `--dry-run-output <dir>` — Directory to write dry-run event JSON files
- `--dry-run-show-kinds <kinds>` — Also print events of these kinds to stdout
  (comma-separated kind numbers)
- `--no-config` — Ignore config file and use only CLI arguments (default:
  `false`)
- `--use-fallback-relays` — Include default nsyte relays in addition to
  configured relays
- `--use-fallbacks` — Enable all fallbacks (currently only relays for this
  command)

## Examples

Preview a snapshot for the current root site without publishing:

```bash
nsyte snapshot --dry-run
```

Publish a snapshot of the root site:

```bash
nsyte snapshot
```

Publish a snapshot for a named site, including fallback relays:

```bash
nsyte snapshot -d docs --use-fallback-relays
```

## See Also

- [`nsyte deploy`](deploy.md) — Publish a new site manifest from a directory
- [`nsyte status`](status.md) — Inspect manifest history and relay coverage
- [`nsyte ls`](ls.md) — List files currently in a site manifest

Inherits global options. See [global options](_global-options.md).
