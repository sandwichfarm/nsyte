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

Initialize a new nsyte project. This creates the necessary configuration files and sets up
authentication.

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

### `nsyte purge`

Remove published files from relays and optionally from Blossom servers.

```bash
nsyte purge [options]
```

Options:

- `--all`: Remove all published files for your pubkey
- `--paths <pattern>`: Remove files matching glob patterns (can be used multiple times)
- `--include-blobs`: Also delete blobs from Blossom servers
- `--yes`: Skip confirmation prompts
- `--relays <relays>`: Override relays to use (comma-separated)
- `--servers <servers>`: Override Blossom servers to use (comma-separated)
- `--nbunksec <string>`: nbunksec string for authentication

Examples:

```bash
# Interactive purge (prompts for what to purge)
nsyte purge

# Purge all published files
nsyte purge --all

# Purge specific files using glob patterns
nsyte purge --paths "*.html" --paths "/static/*"

# Purge all files and their blobs from Blossom servers
nsyte purge --all --include-blobs

# Non-interactive purge (skip confirmation)
nsyte purge --all --yes
```

Pattern matching supports:
- `*` matches any characters
- `?` matches single character
- `**` matches directories recursively

**Note**: Creates NIP-09 delete events. Some relays may not honor delete requests.

### `nsyte debug [npub]`

Debug an nsite by checking relays, blossom servers, and event kinds.

```bash
nsyte debug [npub] [options]
```

Options:

- `--relays <relays>`: Comma-separated list of relay URLs to use
- `--verbose`: Show detailed debug information

Examples:

```bash
# Debug current project's nsite
nsyte debug

# Debug a specific npub
nsyte debug npub1abc123...

# Debug with custom relays
nsyte debug --relays wss://relay1.com,wss://relay2.com
```

The debug command checks:
- Profile (kind 0) existence on relays
- Relay list (kind 10002) for discovering user's preferred relays
- Blossom server list (kind 10063) and tests server availability
- nsite events (kind 34128) for uploaded files
- App handler events (kinds 31989, 31990) for app announcements
- Blob integrity by downloading random files to verify hash correctness

### `nsyte validate`

Validate the nsyte configuration file.

```bash
nsyte validate [options]
```

Options:

- `--file <path>`: Path to configuration file (default: `.nsite/config.json`)
- `--schema`: Show the JSON schema location

Examples:

```bash
# Validate current project config
nsyte validate

# Validate specific file
nsyte validate --file path/to/config.json

# Show schema location
nsyte validate --schema
```

### `nsyte serve`

Build and serve local nsite files for development.

```bash
nsyte serve [options]
```

This command builds your local nsite files and serves them locally for development and testing purposes.

### `nsyte run`

Run a resolver server that serves nsites via npub subdomains.

```bash
nsyte run [options]
```

This command starts a resolver server that can serve nsites via npub subdomains (e.g., `npub123.localhost`).

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

### `nsyte ci`

Generate CI/CD credentials by creating a dedicated nbunksec string for use in automated
environments.

```bash
nsyte ci
```

This command:

- Guides you through bunker connection
- Generates a dedicated nbunksec for CI/CD
- Displays the nbunksec (shown only once!)
- Use the generated nbunksec with `--nbunksec` in your CI/CD pipeline

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

### `nsyte bunker migrate`

Rebuild the bunker index for multiple bunker support (macOS).

```bash
nsyte bunker migrate [pubkey1] [pubkey2] ...
```

This command is needed on macOS when you see warnings about rebuilding the keychain index. By default, it automatically discovers and migrates all bunkers in your keychain. You can optionally specify specific pubkeys to migrate.

Examples:

```bash
# Automatically discover and migrate all bunkers
nsyte bunker migrate

# Migrate specific bunkers if auto-discovery fails
nsyte bunker migrate 9c08bc96... fa02cb9a...
```

On macOS, nsyte uses a two-tier storage system:
- **Keychain**: Stores actual credentials securely
- **Index**: Tracks which bunkers are available (for listing)

This command rebuilds the index by discovering bunkers in the keychain.

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

### Purge All Files

```bash
nsyte purge --all
```

### Purge Specific Files with Patterns

```bash
nsyte purge --paths "*.html" --paths "/assets/*"
```

### Purge Files and Blobs

```bash
nsyte purge --all --include-blobs
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
