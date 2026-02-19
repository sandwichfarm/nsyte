---
title: debug
description: Debug an nsite by checking relays, blossom servers, and event kinds
---

# `nsyte debug`

Debug an nsite by checking relays, blossom servers, and event kinds to help diagnose issues with
nsite setup.

## Usage

```bash
nsyte debug [npub] [options]
```

## Arguments

- `npub` (optional): The npub to debug. If not provided, uses the current project's configuration.

## Options

- `--relays <relays>`: Comma-separated list of relay URLs to use for debugging
- `--verbose`: Show detailed debug information including file lists and hash verification details
- `--show-events`: Pretty print events (kind 0, 10002, server list, and nsite events)
- `--help`: Show help information

## Examples

### Debug Current Project

```bash
nsyte debug
```

This debugs the nsite configured in the current project's `.nsite/config.json`.

### Debug Specific npub

```bash
nsyte debug npub1abc123...
```

### Debug with Custom Relays

```bash
nsyte debug --relays wss://relay1.com,wss://relay2.com
```

### Verbose Debug Output

```bash
nsyte debug --verbose
```

## What It Checks

The debug command performs comprehensive checks on various components of an nsite:

### 1. Profile (kind 0)

- Verifies that the user's profile exists on relays
- Uses specialized profile relays (`purplepag.es`, `user.kindpag.es`) for better results
- Shows profile information when found

### 2. Relay List (kind 10002)

- Discovers the user's preferred relays from their published relay list
- Uses the discovered relays for subsequent checks
- Warns if no relay list is found (cannot discover user's preferred relays)

### 3. Blossom Server List (kind 10063)

- Checks for published blossom server list
- Compares published servers with config servers
- Tests server availability using HTTP requests
- Shows URL normalization mismatches

### 4. Blossom Server Health

- Tests availability of blossom servers from config
- Checks up to 20 random files for 404 status (using HEAD requests)
- Downloads one random file to verify hash integrity
- Reports server response times and error details

### 5. Site Manifest Events (kinds 15128, 35128)

- Finds all uploaded file events for the npub
- Shows total count of uploaded files
- Lists recent files in verbose mode
- Uses specialized nsite relay (`relay.nsite.lol`) for better results

### 6. App Handler Events (kinds 31989, 31990)

- Checks for NIP-89 app handler announcements
- Shows counts of app recommendations and announcements
- Optional check (warnings only if missing)

## Specialized Relays

The debug command uses specialized relays for different event types to get the most comprehensive
results:

- **Profile & Relay Lists**: `purplepag.es`, `user.kindpag.es`, `relay.nsite.lol`
- **nsite Events**: `relay.nsite.lol`
- **App Handlers**: Uses config relays

## Output Format

The debug command provides color-coded output:

- 🟢 **Green**: Successful checks
- 🔴 **Red**: Failed checks or errors
- 🟡 **Yellow**: Warnings or missing optional components
- 🔵 **Blue**: Informational messages
- 🔘 **Gray**: Additional details and secondary information

## Exit Codes

- `0`: All critical checks passed (warnings are acceptable)
- `1`: Critical issues found that prevent nsite functionality

## Critical vs Warning Issues

### Critical Issues (exit code 1):

- No relay list found (kind 10002) - cannot discover user's relays
- No blossom server list found AND no servers in config
- All blossom servers are unavailable

### Warnings (exit code 0):

- No profile found (kind 0)
- No nsite events found (no files uploaded yet)
- No app handler events (optional feature)
- Hash verification failures on individual files

## Troubleshooting

### "No relay list found"

- Publish a relay list using `nsyte deploy <dir> --publish-relay-list`
- Or manually create a kind 10002 event with your preferred relays

### "No blossom server list found"

- Publish a server list using `nsyte deploy <dir> --publish-server-list`
- Or ensure your config has servers configured

### "All blossom servers unavailable"

- Check server URLs for typos
- Verify servers are online and accessible
- Check network connectivity

### "Hash mismatch"

- May indicate data corruption on the blossom server
- Try re-uploading the affected files
- Contact the blossom server administrator

## Related Commands

- [`nsyte deploy`](deploy.md) - Deploy files and publish metadata
- [`nsyte validate`](validate.md) - Validate configuration
- [`nsyte list`](ls.md) - List published files
