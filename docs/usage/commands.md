---
title: Command Reference
description: Overview of all nsyte commands
---

# Command Reference

nsyte provides a comprehensive set of commands for managing nostr sites. Each command is documented
in detail on its own page.

## Core Commands

### Project Management

- [`nsyte init`](commands/init.md) — Initialize a new nsyte project with configuration
- [`nsyte config`](commands/config.md) — Interactive configuration editor
- [`nsyte validate`](commands/validate.md) — Validate your nsyte configuration file

### File Operations

- [`nsyte deploy`](commands/deploy.md) — Deploy files to nostr relays and blossom servers
- [`nsyte sites`](commands/sites.md) — List all published sites for a pubkey
- [`nsyte ls`](commands/ls.md) — List published files
- [`nsyte browse`](commands/browse.md) — Interactive TUI browser for managing files
- [`nsyte download`](commands/download.md) — Download published files
- [`nsyte purge`](commands/purge.md) — Remove published files

### Development

- [`nsyte serve`](commands/serve.md) — Serve files locally for development
- [`nsyte run`](commands/run.md) — Run resolver server with npub subdomains
- [`nsyte debug`](commands/debug.md) — Debug nsites by checking relays and servers
- [`nsyte announce`](commands/announce.md) — Publish app handler events

### Authentication

- [`nsyte bunker`](commands/bunker.md) — Manage NIP-46 bunker connections
- [`nsyte ci`](commands/ci.md) — Generate CI/CD credentials (nbunksec)

### Legacy

- [`nsyte upload`](commands/upload.md) — **DEPRECATED**: Use `deploy` instead

## Global Options

These options are available for all commands:

- `--help` — Show help information
- `--version` — Show version information
- `-c, --config <path>` — Path to config file (default: `.nsite/config.json`)

## Authentication Options

Many commands support unified authentication:

- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec, bunker://, or 64-char hex)

The `--sec` flag automatically detects the format of your secret:
- `nsec1...` - Nostr private key (bech32)
- `nbunksec...` - Encoded bunker credentials  
- `bunker://...` - Bunker URL with relay and optional secret
- 64-character hex string - Raw private key

If not provided, commands will use the bunker configured in `.nsite/config.json` or prompt for authentication.

## Configuration

nsyte uses a configuration file at `.nsite/config.json` which can store:

- Default relays
- Default blossom servers
- Bunker connections
- Project metadata

Use `nsyte init` to create a new configuration or `nsyte validate` to check an existing one.

## Environment Variables

- `LOG_LEVEL` — Logging level: `none`, `error`, `warn`, `info`, `debug` (default: `info`)
- `NSITE_DISPLAY_MODE` — Display mode: `interactive`, `non-interactive`, `debug` (default: `interactive`)
- `NSYTE_DISABLE_KEYCHAIN` — Disable native keychain, use encrypted file storage (set to `true`)
- `NSYTE_TEST_MODE` — Enable test mode, disables keychain (set to `true`)
- `NSYTE_FORCE_ENCRYPTED_STORAGE` — Force encrypted file storage instead of OS keychain (set to `true`)

## Getting Started

1. Initialize a new project:
   ```bash
   nsyte init
   ```

2. Deploy your site:
   ```bash
   nsyte deploy ./dist
   ```

3. View your published files:
   ```bash
   nsyte browse
   ```

## Common Workflows

### Publishing a Website

```bash
# Initialize project
nsyte init

# Deploy files
nsyte deploy ./dist --publish-profile --publish-relay-list

# Verify deployment
nsyte ls
```

### Managing Files

```bash
# Interactive file browser
nsyte browse

# List files in terminal
nsyte ls

# Remove specific files
nsyte purge --paths "*.old" --include-blobs
```

### CI/CD Integration

```bash
# Generate CI credentials
nsyte ci

# Use in CI pipeline
nsyte deploy ./dist --sec $NSYTE_NBUNKSEC
```

## See Also

- [Configuration Reference](../configuration.md)
- [Security Guide](../guides/security.md)
- [CI/CD Guide](../guides/ci-cd.md)
