---
title: purge
description: Remove published files from relays and optionally from blossom servers
---

# `nsyte purge`

Remove published files from nostr relays and optionally delete blobs from blossom servers. This
command creates NIP-09 delete events to remove your published nsite files.

## Usage

```bash
nsyte purge [options]
```

## Options

- `-r, --relays <relays>` — Nostr relays to publish delete events to (comma-separated)
- `-s, --servers <servers>` — Blossom servers to delete blobs from (comma-separated)
- `--include-blobs` — Also delete blobs from blossom servers (default: false)
- `--sec <secret>` — Secret for signing (auto-detects: nsec, nbunksec, bunker://, hex)
- `-d, --name <name>` — Site identifier for named sites. If not provided, deletes root site
- `-y, --yes` — Skip confirmation prompts (default: false)

## Examples

Purge root site with confirmation:

```bash
nsyte purge
```

Purge named site:

```bash
nsyte purge -d blog
```

Purge site and delete blobs from blossom servers:

```bash
nsyte purge --include-blobs
```

Purge without confirmation (for CI/CD):

```bash
nsyte purge -y
```

Purge with custom relays and servers:

```bash
nsyte purge -r wss://relay1.com,wss://relay2.com -s https://server1.com
```

Purge named site including blobs:

```bash
nsyte purge -d blog --include-blobs -y
```

## How it Works

1. **Identifies site**: Determines which site to purge (root or named)
2. **Fetches manifest**: Retrieves current site manifest from relays
3. **Confirmation**: Shows preview of files to be deleted (first 5 + count)
4. **Creates delete event**: Publishes NIP-09 Kind 5 delete event for the site manifest
5. **Deletes blobs** (if `--include-blobs`): Attempts to delete blobs from blossom servers using BUD-04 auth

## Blob Deletion

When using `--include-blobs`, nsyte attempts to delete the actual blob files from blossom servers:

- **Batch deletion first**: Tries batch deletion with BUD-04 auth
- **Individual fallback**: If batch fails, attempts individual file deletion with auth
- **Best effort**: Some servers may not support deletion or may reject the request

Note: Delete events only remove references from relays. Use `--include-blobs` to also remove the actual files from storage servers.

### Path Matching Rules

- Paths are matched against the file paths as stored in your nsite events
- Patterns are case-sensitive
- Leading slashes are optional but recommended for clarity
- Use quotes around patterns to prevent shell expansion

## How It Works

The purge command:

1. **Fetches Events**: Retrieves your published site manifest events (kinds 15128, 35128) from
   relays
2. **Filters Files**: Applies pattern matching to select files for deletion
3. **Confirms Action**: Shows what will be deleted and asks for confirmation (unless `--yes`)
4. **Creates Delete Events**: Publishes NIP-09 delete events to relays
5. **Deletes Blobs**: Optionally deletes actual files from blossom servers (if `--include-blobs`)

## NIP-09 Delete Events

The purge command creates [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) delete
events:

- Each delete event references the original nsite event
- Relays may or may not honor delete requests
- Some relays might keep deleted events for historical purposes
- Deletion is not guaranteed and may take time to propagate

## Blob Deletion

When using `--include-blobs`:

- Makes DELETE requests to blossom servers
- Only deletes blobs you own (authenticated by your key)
- Blossom servers may have different deletion policies
- Some servers might not support deletion
- Files might be cached or replicated elsewhere

## Authentication

The purge command requires authentication to:

- Sign delete events
- Authenticate blob deletion requests

Authentication options (in order of precedence):

1. `--sec` command line option
2. Configured bunker in project
3. Private key in project configuration

## Safety Features

### Confirmation Prompts

By default, the command shows:

- List of files to be deleted
- Number of files affected
- Whether blobs will be deleted
- Confirmation prompt before proceeding

### Dry Run Information

The command shows what would be deleted before actually doing it:

```
Found 15 files matching your criteria:
  /index.html
  /about.html
  /assets/style.css
  ...

This will:
✓ Create delete events on 3 relays
✓ Delete 15 blobs from 2 blossom servers

Are you sure? (y/N)
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

- Retries failed operations
- Shows progress and error details
- Graceful handling of timeouts

## Limitations

### Not Truly Permanent

- Relays may not honor delete requests
- Data might be cached or archived elsewhere
- Consider this "request for deletion" rather than guaranteed deletion

### No Undo

- Once delete events are published, they cannot be undone
- You would need to re-upload files to restore them
- Always double-check your patterns before confirming

### Server Dependencies

- Depends on relay and blossom server cooperation
- Some servers might not implement deletion
- Results may vary across different servers

## Best Practices

### Test Patterns First

Use a specific pattern to test before purging everything:

```bash
# Test with a small subset first
nsyte purge --paths "test.html"

# Then purge everything if the pattern works
nsyte purge --all
```

### Backup Before Purging

Keep local copies of important files:

```bash
# Download files before purging
nsyte download ./backup

# Then purge
nsyte purge --all
```

### Use Specific Patterns

Be as specific as possible with patterns:

```bash
# Good: specific directory
nsyte purge --paths "/old-version/*"

# Risky: too broad
nsyte purge --paths "*"
```

## Related Commands

- [`nsyte upload`](upload.md) - Upload files to create nsites
- [`nsyte ls`](ls.md) - List published files before purging
- [`nsyte download`](download.md) - Download files for backup
- [`nsyte debug`](debug.md) - Debug connectivity issues
