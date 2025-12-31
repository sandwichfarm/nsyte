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
- [`nsyte validate`](commands/validate.md) — Validate your nsyte configuration file

### File Operations

- [`nsyte deploy`](commands/deploy.md) — Deploy files to nostr relays and blossom servers
- [`nsyte ls`](commands/ls.md) — List published files
- [`nsyte browse`](commands/browse.md) — Interactive TUI browser for managing files
- [`nsyte download`](commands/download.md) — Download published files
- [`nsyte purge`](commands/purge.md) — Remove published files

### Development

- [`nsyte serve`](commands/serve.md) — Serve files locally for development
- [`nsyte run`](commands/run.md) — Run resolver server with npub subdomains
- [`nsyte debug`](commands/debug.md) — Debug nsites by checking relays and servers

### Authentication

- [`nsyte bunker`](commands/bunker.md) — Manage NIP-46 bunker connections
- [`nsyte ci`](commands/ci.md) — Generate CI/CD credentials (nbunksec)

### Legacy

- [`nsyte upload`](commands/upload.md) — **DEPRECATED**: Use `deploy` instead

## Global Options

These options are available for all commands:

- `--help` — Show help information
- `--version` — Show version information
- `--verbose` — Enable verbose output
- `--quiet` — Suppress all output except errors

## Authentication Options

Many commands support these authentication options:

- `-k, --privatekey <nsec>` — Private key (nsec/hex) for signing
- `-b, --bunker <url>` — NIP-46 bunker URL for signing
- `--nbunksec <nbunksec>` — NIP-46 bunker encoded as nbunksec

## Configuration

nsyte uses a configuration file at `.nsite/config.json` which can store:

- Default relays
- Default blossom servers
- Bunker connections
- Project metadata

Use `nsyte init` to create a new configuration or `nsyte validate` to check an existing one.

## Environment Variables

- `NSITE_CONFIG` — Path to configuration file (default: `.nsite/config.json`)
- `NSITE_RELAYS` — Comma-separated list of relay URLs
- `NSITE_SERVERS` — Comma-separated list of server URLs
- `NSITE_BUNKER` — Bunker connection string
- `NSITE_NBUNKSEC` — nbunksec string for authentication

## Exit Codes

- `0` — Success
- `1` — General error
- `2` — Configuration error
- `3` — Authentication error
- `4` — Network error
- `5` — File system error

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
nsyte deploy ./dist --nbunksec $NSYTE_NBUNKSEC
```

## See Also

- [Getting Started Guide](../getting-started.md)
- [Configuration Reference](../configuration.md)
- [Troubleshooting](../troubleshooting.md)
