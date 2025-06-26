> ⚠️ nsyte is alpha. use at your own risk.

# nsyte

![Coverage](./static/coverage-badge.svg) ![Line Coverage](./static/coverage-lines-badge.svg)
![Branch Coverage](./static/coverage-branches-badge.svg)

A command-line tool for publishing nsites to nostr and Blossom servers. Enables decentralized,
censorship-resistant website hosting.

For more nsite related tools and services check out [awesome-nsite](https://github.com/nostrver-se/awesome-nsite)

> nsyte is a fork of [nsite-cli](https://github.com/flox1an/nsite-cli) by
> [flox1an](https://github.com/flox1an)
> [[npub](https://njump.me/npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc)]. This
> fork has been ported to deno and rewritten in the process. Some behaviors in this fork are
> slightly different.

![nsyte screen demo](./static/nsyte.gif)

## Quick Start

```bash
# Install from JSR
deno install -A -f -g -n nsyte jsr:@nsyte/cli
# Or use pre-built binary from releases

# Initialize project (interactive setup)
nsyte init

# Upload website
nsyte upload ./dist
```

## Table of Contents

- [Installation](#installation)
- [Core Commands](#core-commands)
- [Authentication Methods](#authentication-methods)
- [Security](#security)
- [CI/CD Integration](#cicd-integration)
- [Configuration](#configuration)
- [Advanced Usage](#advanced-usage)
- [Development](#development)

## Installation

### Alternative Installation Methods

**Using Deno**

```bash
deno install -A -f -g -n nsyte jsr:@nsyte/cli
```

**Pre-built Binaries:** Download from [Releases](https://github.com/sandwichfarm/nsyte/releases)

**Build Yourself:**

```bash
# Current platform
deno task compile

# All platforms
deno task compile:all
```

## Core Commands

| Command                 | Description              |
| ----------------------- | ------------------------ |
| `nsyte`                 | Interactive setup wizard |
| `nsyte init`            | Initialize configuration |
| `nsyte upload <dir>`    | Upload files             |
| `nsyte ls`              | List published files     |
| `nsyte download <dir>`  | Download files           |
| `nsyte bunker <action>` | Manage NIP-46 bunkers    |

### Uploading Files

```bash
# Basic upload
nsyte upload ./dist

# With options
nsyte upload ./dist --force --concurrency 8 --verbose
```

## Authentication Methods

nsyte supports three ways to authenticate:

### 1. Generated Private Key

Create and use a new nostr key pair.

### 2. Existing Private Key

Use your own nostr private key.

### 3. nostr Bunker (NIP-46)

Recommended for maximum security - keep keys on a separate device.

```bash
# Connect to bunker...

# interactively
nsyte bunker connect

# non-interactively
nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'
# or
nsyte bunker connect --pubkey <pubkey> --relay <relay> --secret <secret>

# List bunkers
nsyte bunker list
```

## Security

**Private Keys**: Never exposed to servers, stored in project configuration.

**Secure Credential Storage**:

- nsyte uses a multi-tier security approach for storing sensitive bunker connection data
- **Tier 1 (Best)**: Native OS keychain services:
  - macOS: Keychain Services (security command)
  - Windows: Credential Manager (cmdkey/PowerShell)
  - Linux: Secret Service API (libsecret/secret-tool)
- **Tier 2 (Good)**: AES-256-GCM encrypted file storage when native keychain unavailable
- **Tier 3 (Fallback)**: Plain JSON storage with security warnings

**Storage Locations**:

- Secure storage: Platform-specific keychain or encrypted files
- Config directories:
  - Linux: `~/.config/nsyte`
  - macOS: `~/Library/Application Support/nsyte`
  - Windows: `%APPDATA%\nsyte`

**Bunker Connections**:

- Uses NIP-46 protocol for remote signing
- Connection secrets automatically encrypted and stored securely
- Legacy plain-text storage automatically migrated to secure storage

**nbunksec Strings**:

- Contain sensitive key material
- Automatically stored in most secure available backend
- Must be stored securely in CI/CD environments
- Should be rotated periodically

**Security Features**:

- Automatic migration from legacy plain-text storage
- Platform-specific encryption key derivation
- Graceful fallback when secure storage unavailable
- Comprehensive error handling and logging

## CI/CD Integration

Generate secure credentials for CI/CD environments:

```bash
# Generate CI/CD credentials (interactive)
nsyte ci

# This will:
# 1. Guide you through bunker connection
# 2. Generate an nbunksec string for CI/CD use
# 3. Display the nbunksec (shown only once!)

# Add the nbunksec to your CI/CD secrets (e.g., NBUNK_SECRET)
# Then use in your pipeline:
nsyte upload ./dist --nbunksec ${NBUNK_SECRET}
```

**Security Best Practices:**

- Generate dedicated nbunksec for CI/CD (don't reuse personal credentials)
- Rotate nbunksec periodically
- Restrict bunker permissions to only required event kinds
- Store nbunksec securely in your CI/CD platform's secret manager

### GitHub Actions Example

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: nsyte upload ./dist --nbunksec ${{ secrets.NBUNK_SECRET }}
```

## Configuration

Configuration is stored in `.nsite/config.json`:

```json
{
  "bunkerPubkey": "abc123...",
  "relays": ["wss://relay1", "wss://relay2"],
  "servers": ["https://server1", "https://server2"],
  "profile": { "name": "My Site", "about": "Description" },
  "publishServerList": true,
  "publishRelayList": true,
  "fallback": "/index.html"
}
```

### Ignoring Files (`.nsite-ignore`)

Similar to `.gitignore`, you can create a `.nsite-ignore` file in the root of your project (the
directory where you run the `nsyte` command) to specify files and directories that should be
excluded from uploads.

- Create a file named `.nsite-ignore`.
- Add patterns using standard [glob syntax](https://en.wikipedia.org/wiki/Glob_(programming)), one
  pattern per line.
- Lines starting with `#` are treated as comments.
- Directories should usually end with a `/`.
- The patterns are matched against paths relative to the directory where `nsyte` is executed.

**Default Ignore Patterns:**

By default, `nsyte` ignores the following patterns:

```
.git/**
.DS_Store
node_modules/**
.nsite-ignore
.nsite/config.json
.vscode/**
```

**Example `.nsite-ignore`:**

```
# Ignore build artifacts
dist/
*.log

# Ignore specific config files
secrets.json
```

## Advanced Usage

### Bunker Command Options

```bash
# Import an nbunksec string
nsyte bunker import nbunk1q...

# Export bunker as nbunksec
nsyte bunker export <pubkey>

# Configure project to use specific bunker
nsyte bunker use <pubkey>

# Remove a bunker
nsyte bunker remove <pubkey>
```

### Upload Command Options

```
--force            Force re-upload of all files
--purge            Delete files that no longer exist locally
--verbose          Show detailed progress
--concurrency <n>  Number of parallel uploads (default: 4)
--fallback <file>  HTML file to use as 404.html
--nbunksec <string>   nbunksec string for authentication
```

### Deep Linking in SPAs

For client-side routing (React, Vue, etc.):

```bash
nsyte upload ./dist --fallback=/index.html
```

## Development

### Prerequisites

- Deno 2^

### Tasks

```bash
# Run development version
deno task dev

# Run tests
deno task test

# Build binaries
deno task compile:all
```

## License

[MIT License](LICENSE)
