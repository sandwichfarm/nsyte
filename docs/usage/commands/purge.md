---
title: purge
description: Remove published files from relays and optionally from blossom servers
---

# `nsyte purge`

Remove published files from nostr relays and optionally delete blobs from blossom servers. This command creates NIP-09 delete events to remove your published nsite files.

## Usage

```bash
nsyte purge [options]
```

## Options

- `--all`: Remove all published files for your pubkey
- `--paths <pattern>`: Remove files matching glob patterns (can be used multiple times)
- `--include-blobs`: Also delete blobs from blossom servers
- `--yes`: Skip confirmation prompts (non-interactive mode)
- `--relays <relays>`: Override relays to use (comma-separated)
- `--servers <servers>`: Override blossom servers to use (comma-separated)
- `--nbunksec <string>`: nbunksec string for authentication
- `--help`: Show help information

## Examples

### Interactive Purge

```bash
nsyte purge
```

Prompts you to choose what to purge from a list of published files.

### Purge All Files

```bash
nsyte purge --all
```

Removes all published files for your pubkey.

### Purge Specific Patterns

```bash
nsyte purge --paths "*.html" --paths "/static/*"
```

Removes all HTML files and everything in the `/static/` directory.

### Purge Files and Blobs

```bash
nsyte purge --all --include-blobs
```

Removes all files from relays AND deletes the actual blobs from blossom servers.

### Non-Interactive Purge

```bash
nsyte purge --all --yes
```

Purges all files without asking for confirmation (useful for CI/CD).

### Purge with Custom Relays

```bash
nsyte purge --all --relays wss://relay1.com,wss://relay2.com
```

## Pattern Matching

The `--paths` option supports glob patterns:

### Wildcard Patterns
- `*` matches any characters within a directory
- `?` matches a single character
- `**` matches directories recursively

### Examples

```bash
# Remove all HTML files
nsyte purge --paths "*.html"

# Remove all files in a specific directory
nsyte purge --paths "/assets/*"

# Remove all CSS files recursively
nsyte purge --paths "**/*.css"

# Remove specific files
nsyte purge --paths "/index.html" --paths "/about.html"

# Remove all JavaScript files in any subdirectory
nsyte purge --paths "**/js/*.js"
```

### Path Matching Rules
- Paths are matched against the file paths as stored in your nsite events
- Patterns are case-sensitive
- Leading slashes are optional but recommended for clarity
- Use quotes around patterns to prevent shell expansion

## How It Works

The purge command:

1. **Fetches Events**: Retrieves your published nsite events (kind 34128) from relays
2. **Filters Files**: Applies pattern matching to select files for deletion
3. **Confirms Action**: Shows what will be deleted and asks for confirmation (unless `--yes`)
4. **Creates Delete Events**: Publishes NIP-09 delete events to relays
5. **Deletes Blobs**: Optionally deletes actual files from blossom servers (if `--include-blobs`)

## NIP-09 Delete Events

The purge command creates [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) delete events:

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
1. `--nbunksec` command line option
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