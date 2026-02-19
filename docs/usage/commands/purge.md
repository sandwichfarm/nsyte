---
title: purge
description: Remove site manifest events from relays and optionally delete blobs from servers
---

# `nsyte purge`

Remove a site manifest from nostr relays and optionally delete blobs from blossom servers. This
command creates NIP-09 delete events to remove the site manifest event for your root or named site.

**Aliases:** `prg`

## Usage

```bash
nsyte purge [options]
```

## Options

- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `-s, --servers <servers>` — The blossom servers to delete blobs from (comma separated)
- `--include-blobs` — Also delete blobs from blossom servers (default: false)
- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or
  64-char hex)
- `-d, --name <name>` — Site identifier for named sites (kind 35128). If not provided, deletes root
  site (kind 15128)
- `-y, --yes` — Skip confirmation prompts (default: false)

## Examples

### Purge Root Site

```bash
nsyte purge
```

Fetches the root site manifest and asks for confirmation before deleting.

### Purge a Named Site

```bash
nsyte purge --name blog
```

Deletes the named site "blog" (kind 35128 with `d` tag "blog").

### Purge with Blob Deletion

```bash
nsyte purge --include-blobs
```

Deletes the site manifest from relays AND deletes the associated blobs from blossom servers.

### Non-Interactive Purge

```bash
nsyte purge --yes
```

Purges without asking for confirmation (useful for CI/CD).

### Purge with Custom Relays and Servers

```bash
nsyte purge --relays wss://relay1.com,wss://relay2.com --servers https://server1.com
```

## How It Works

The purge command:

1. **Fetches Manifest**: Retrieves the site manifest event (kind 15128 for root, or kind 35128 for
   named sites) from relays
2. **Shows Preview**: Displays the files in the manifest and asks for confirmation
3. **Creates Delete Event**: Publishes a NIP-09 delete event referencing the manifest event
4. **Deletes Blobs**: Optionally deletes blobs from blossom servers (if `--include-blobs`)

## Blob Deletion

When using `--include-blobs`:

- Extracts SHA256 hashes from the manifest's path tags
- Attempts batch authorization first, falls back to individual authorization per blob
- Makes DELETE requests to blossom servers with Nostr authentication
- Reports success/failure for each blob

## Authentication

The purge command requires authentication to:

- Sign delete events
- Authenticate blob deletion requests

Authentication options (in order of precedence):

1. `--sec` command line option (auto-detects format)
2. Configured bunker in project
3. Private key in project configuration

## Safety Features

- Confirmation prompt before deletion (skip with `--yes`)
- Shows the number of files and first few paths before deleting
- Detailed progress and error reporting for blob deletion

## Limitations

- Relays may not honor delete requests
- Data might be cached or archived elsewhere
- Deletion is not guaranteed and may take time to propagate
- Once delete events are published, they cannot be undone

## Related Commands

- [`nsyte deploy`](deploy.md) — Deploy files to create nsites
- [`nsyte list`](ls.md) — List published files before purging
- [`nsyte sites`](sites.md) — List all sites for a pubkey
- [`nsyte download`](download.md) — Download files for backup
- [`nsyte debug`](debug.md) — Debug connectivity issues
