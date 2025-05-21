---
title: Command Reference
description: Complete reference of all nsyte commands and options
---

# Command Reference

This document provides a complete reference of all nsyte commands and their options.

## Core Commands

### `nsyte`

Run the interactive setup wizard. This is the same as `nsyte init`.

```bash
nsyte
```

### `nsyte init`

Initialize a new nsyte project. This creates the necessary configuration files and sets up authentication.

```bash
nsyte init
```

The command will interactively:
1. Ask for authentication method
2. Configure relays and servers
3. Create `.nsite` directory with configuration

### `nsyte upload <dir>`

Upload files from the specified directory to nostr relays and blossom servers.

```bash
nsyte upload ./dist [options]
```

Options:
- `--force`: Force re-upload of all files
- `--purge`: Delete files that no longer exist locally
- `--verbose`: Show detailed progress
- `--concurrency <n>`: Number of parallel uploads (default: 4)
- `--fallback <file>`: HTML file to use as 404.html
- `--nbunksec <string>`: nbunksec string for authentication

### `nsyte ls`

List all published files.

```bash
nsyte ls [options]
```

Options:
- `--verbose`: Show detailed file information
- `--format <format>`: Output format (json, table)

### `nsyte download <dir>`

Download published files to the specified directory.

```bash
nsyte download ./backup [options]
```

Options:
- `--force`: Overwrite existing files
- `--verbose`: Show detailed progress

## Bunker Commands

### `nsyte bunker connect`

Connect to a nostr bunker (NIP-46).

```bash
# Using bunker URL
nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'

# Using individual parameters
nsyte bunker connect --pubkey <pubkey> --relay <relay> --secret <secret>
```

Options:
- `--pubkey <pubkey>`: Bunker public key
- `--relay <relay>`: Relay URL
- `--secret <secret>`: Connection secret

### `nsyte bunker list`

List all connected bunkers.

```bash
nsyte bunker list
```

### `nsyte bunker import`

Import a bunker connection from an nbunksec string.

```bash
nsyte bunker import <nbunksec>
```

### `nsyte bunker export`

Export a bunker connection as an nbunksec string.

```bash
nsyte bunker export <pubkey>
```

### `nsyte bunker use`

Configure the project to use a specific bunker.

```bash
nsyte bunker use <pubkey>
```

### `nsyte bunker remove`

Remove a bunker connection.

```bash
nsyte bunker remove <pubkey>
```

## Global Options

These options are available for all commands:

- `--help`: Show help information
- `--version`: Show version information
- `--verbose`: Enable verbose output
- `--quiet`: Suppress all output except errors

## Examples

### Basic Upload

```bash
nsyte upload ./dist
```

### Upload with Options

```bash
nsyte upload ./dist --force --concurrency 8 --verbose
```

### Connect to Bunker

```bash
nsyte bunker connect --pubkey npub1... --relay wss://relay.example --secret xxx
```

### List Files in JSON Format

```bash
nsyte ls --format json
```

### Download with Verbose Output

```bash
nsyte download ./backup --verbose
```

## Exit Codes

- `0`: Success
- `1`: General error
- `2`: Configuration error
- `3`: Authentication error
- `4`: Network error
- `5`: File system error

## Environment Variables

- `NSITE_CONFIG`: Path to configuration file (default: `.nsite/config.json`)
- `NSITE_RELAYS`: Comma-separated list of relay URLs
- `NSITE_SERVERS`: Comma-separated list of server URLs
- `NSITE_BUNKER`: Bunker connection string
- `NSITE_NBUNKSEC`: nbunksec string for authentication 