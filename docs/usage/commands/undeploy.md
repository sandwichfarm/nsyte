---
title: undeploy
description: Completely remove a deployed site from relays and blossom servers
---

# `nsyte undeploy`

Completely remove a deployed site: delete all blobs from blossom servers and remove the site manifest
from relays. This is the nuclear option for fully taking down a site.

## Usage

```bash
nsyte undeploy [options]
```

## Options

- `-r, --relays <relays>` — Nostr relays to use (comma-separated)
- `-s, --servers <servers>` — Blossom servers to delete blobs from (comma-separated)
- `--sec <secret>` — Secret for signing (auto-detects: nsec, nbunksec, bunker://, hex)
- `-d, --name <name>` — Site identifier for named sites. If not provided, undeploys root site
- `-y, --yes` — Skip confirmation prompts (default: false)

## Examples

Undeploy root site:

```bash
nsyte undeploy
```

Undeploy a named site:

```bash
nsyte undeploy -d blog
```

Undeploy in CI (skip type-to-confirm):

```bash
nsyte undeploy --yes --sec $NSYTE_NBUNKSEC
```

Undeploy with custom relays and servers:

```bash
nsyte undeploy -r wss://relay1.com,wss://relay2.com -s https://server1.com
```

## How it Works

1. **Fetches manifest**: Retrieves the current site manifest from relays
2. **Shows summary**: Displays number of blobs, servers, and relays affected
3. **Type-to-confirm**: Requires typing the site name (or "undeploy" for root sites) to confirm
4. **Deletes blobs**: Removes all blob files from all configured blossom servers
5. **Removes manifest**: Publishes NIP-09 Kind 5 delete event for the site manifest

Unlike `delete`, which selectively removes site events, `undeploy` always deletes both the blobs
from blossom servers and the manifest from relays.

## Confirmation

The undeploy command uses a type-to-confirm prompt for safety:

```
This will delete 42 blobs from 2 servers and remove the site manifest from 3 relays.
  - /index.html
  - /about.html
  - /assets/style.css
  ...and 39 more files

Type "undeploy" to confirm:
```

For named sites, you type the site name instead:

```
Type "blog" to confirm:
```

Use `--yes` to skip the confirmation prompt in CI/CD pipelines.

## Authentication

The undeploy command requires authentication to:

- Sign delete events for the manifest
- Authenticate blob deletion requests on blossom servers

Authentication options (in order of precedence):

1. `--sec` command line option
2. Configured bunker in project
3. Private key in project configuration

## Error Handling

- If no blossom servers are configured, blob deletion is skipped with a warning
- Individual blob deletion failures are logged but don't stop the process
- At least one successful relay publish is required for the manifest deletion
- Shows a results summary at the end

## See Also

- [`nsyte delete`](delete.md) - Selectively remove site events from relays
- [`nsyte deploy`](deploy.md) - Deploy files to create nsites
- [`nsyte ls`](ls.md) - List published files
- [`nsyte download`](download.md) - Download files for backup
