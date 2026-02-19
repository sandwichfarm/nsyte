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
- [`nsyte config`](commands/config.md) — Interactive TUI configuration editor

### File Operations

- [`nsyte deploy`](commands/deploy.md) — Deploy files to nostr relays and blossom servers
- [`nsyte list`](commands/ls.md) — List files for a specific site (alias: `ls`)
- [`nsyte sites`](commands/sites.md) — List all root and named sites for a pubkey
- [`nsyte browse`](commands/browse.md) — Interactive TUI browser for managing files
- [`nsyte download`](commands/download.md) — Download published files (alias: `dl`)
- [`nsyte purge`](commands/purge.md) — Remove a site manifest from relays (alias: `prg`)

### Development

- [`nsyte serve`](commands/serve.md) — Serve files locally for development (alias: `srv`)
- [`nsyte run`](commands/run.md) — Run resolver server with npub subdomains (alias: `rn`)
- [`nsyte debug`](commands/debug.md) — Debug nsites by checking relays and servers

### Authentication

- [`nsyte bunker`](commands/bunker.md) — Manage NIP-46 bunker connections
- [`nsyte ci`](commands/ci.md) — Generate CI/CD credentials (nbunksec)

### Metadata

- [`nsyte announce`](commands/announce.md) — Publish app handler announcements (alias: `annc`)

## Global Options

These options are available for all commands:

- `-c, --config <path>` — Path to config file (default: `.nsite/config.json`)
- `--help` — Show help information
- `--version` — Show version information

## Authentication

Many commands accept the unified `--sec` flag for authentication:

```bash
--sec <secret>
```

The `--sec` flag auto-detects the format of the provided secret:

- **nsec**: Nostr private key in bech32 format (`nsec1...`)
- **nbunksec**: Encoded bunker secret (`nbunksec1...`)
- **bunker:// URL**: NIP-46 bunker connection URL (`bunker://pubkey?relay=...`)
- **Hex key**: 64-character hex private key

If no `--sec` flag is provided, nsyte falls back to the bunker or key configured in your project's
`.nsite/config.json`.

## NIP-05 Support

Commands that accept a `-p, --pubkey` flag also support NIP-05 identifiers:

```bash
nsyte list --pubkey user@domain.com
nsyte sites --pubkey @domain.com
nsyte download --pubkey domain.com
```

## Configuration

nsyte uses a configuration file at `.nsite/config.json` which can store:

- Default relays
- Default blossom servers
- Bunker connections
- Project metadata

Use `nsyte init` to create a new configuration, `nsyte config` to edit interactively, or
`nsyte validate` to check an existing one.

## Environment Variables

- `NSITE_CONFIG` — Path to configuration file (default: `.nsite/config.json`)
- `NSITE_RELAYS` — Comma-separated list of relay URLs
- `NSITE_SERVERS` — Comma-separated list of server URLs

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
nsyte list
```

### Managing Files

```bash
# Interactive file browser
nsyte browse

# List files in terminal
nsyte list

# List all sites
nsyte sites
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
