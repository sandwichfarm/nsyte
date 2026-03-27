---
title: delete
description: Selectively remove published files from relays and optionally from blossom servers
---

# `nsyte delete`

Selectively delete nsite events from relays and optionally delete blobs from blossom servers. This
command creates NIP-09 delete events to remove your published nsite files.

> **Note**: The `purge` command still works as an alias but is deprecated. Please use `delete`
> instead.

## Usage

```bash
nsyte delete [options]
```

## Options

- `-r, --relays <relays>` — Nostr relays to publish delete events to (comma-separated)
- `-s, --servers <servers>` — Blossom servers to delete blobs from (comma-separated)
- `--include-blobs` — Also delete blobs from blossom servers (default: false)
- `--sec <secret>` — Secret for signing (auto-detects: nsec, nbunksec, bunker://, hex)
- `-d, --name <name>` — Site identifier for named sites. If not provided, deletes root site
- `-y, --yes` — Skip confirmation prompts (default: false)

## Examples

Delete root site with confirmation:

```bash
nsyte delete
```

Delete a named site:

```bash
nsyte delete -d blog
```

Delete site and its blobs from blossom servers:

```bash
nsyte delete --include-blobs
```

Delete without confirmation (for CI/CD):

```bash
nsyte delete -y
```

Delete with custom relays and servers:

```bash
nsyte delete -r wss://relay1.com,wss://relay2.com -s https://server1.com
```

Delete named site including blobs:

```bash
nsyte delete -d blog --include-blobs -y
```

## How it Works

1. **Identifies site**: Determines which site to delete (root or named)
2. **Fetches manifest**: Retrieves current site manifest from relays
3. **Confirmation**: Shows preview of files to be deleted (first 5 + count)
4. **Creates delete event**: Publishes NIP-09 Kind 5 delete event for the site manifest
5. **Deletes blobs** (if `--include-blobs`): Attempts to delete blobs from blossom servers using
   BUD-04 auth

## Blob Deletion

When using `--include-blobs`, nsyte attempts to delete the actual blob files from blossom servers:

- **Batch deletion**: Signs batch delete auth tokens (up to 20 hashes per token)
- **Best effort**: Some servers may not support deletion or may reject the request

Note: Delete events only remove references from relays. Use `--include-blobs` to also remove the
actual files from storage servers.

## NIP-09 Delete Events

The delete command creates [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) delete
events:

- Each delete event references the original nsite event
- Relays may or may not honor delete requests
- Some relays might keep deleted events for historical purposes
- Deletion is not guaranteed and may take time to propagate

## Authentication

The delete command requires authentication to:

- Sign delete events
- Authenticate blob deletion requests

Authentication options (in order of precedence):

1. `--sec` command line option
2. Configured bunker in project
3. Private key in project configuration

## Safety Features

### Confirmation Prompts

By default, the command shows:

- List of files to be deleted (first 5 + count)
- Confirmation prompt before proceeding

### Preview

The command shows what would be deleted before actually doing it:

```
This will delete root site (15 files):
  - /index.html
  - /about.html
  - /assets/style.css
  ...and 12 more files

Are you sure you want to delete the root site? This cannot be undone. (y/N)
```

## Error Handling

### Relay Errors

- If some relays fail, the command continues with available relays
- Shows warnings for failed relay operations
- At least one successful relay publish is required

### Blossom Server Errors

- Continues if some servers fail blob deletion
- Shows warnings for failed deletions
- Non-fatal (delete events are still published)

### Network Issues

- Shows progress and error details
- Graceful handling of timeouts

## Limitations

### Not Truly Permanent

- Relays may not honor delete requests
- Data might be cached or archived elsewhere
- Consider this "request for deletion" rather than guaranteed deletion

### No Undo

- Once delete events are published, they cannot be undone
- You would need to re-deploy files to restore them
- Always double-check before confirming

### Server Dependencies

- Depends on relay and blossom server cooperation
- Some servers might not implement deletion
- Results may vary across different servers

## Best Practices

### Backup Before Deleting

Keep local copies of important files:

```bash
# Download files before deleting
nsyte download ./backup

# Then delete
nsyte delete
```

## Related Commands

- [`nsyte deploy`](deploy.md) - Deploy files to create nsites
- [`nsyte undeploy`](undeploy.md) - Completely remove a deployed site
- [`nsyte ls`](ls.md) - List published files before deleting
- [`nsyte download`](download.md) - Download files for backup
- [`nsyte debug`](debug.md) - Debug connectivity issues
