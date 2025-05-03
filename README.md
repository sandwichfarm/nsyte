> ⚠️ nsyte is alpha. use at your own risk.

# nsyte

A command-line tool for publishing websites to NOSTR and Blossom servers. Enables decentralized, censorship-resistant website hosting.

> nsyte is a fork of [nsite-cli](https://github.com/flox1an/nsite-cli) by [flox1an](https://github.com/flox1an) [[npub](https://njump.me/npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc)]. This fork has been ported to deno and rewritten in the process. Some behaviors in this fork are slightly different.

## Quick Start

```bash
# Install
deno install -A -f -n nsyte https://github.com/username/nsyte/raw/main/src/cli.ts
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

### Using Deno

```bash
deno install -A -f -n nsyte https://raw.githubusercontent.com/username/nsyte/main/src/cli.ts
```

### Pre-built Binaries

Download from [Releases](https://github.com/username/nsyte/releases)

### Build Yourself

```bash
# Current platform
deno task compile

# All platforms
deno task compile:all
```

## Core Commands

| Command | Description |
|---------|-------------|
| `nsyte` | Interactive setup wizard |
| `nsyte init` | Initialize configuration |
| `nsyte upload <dir>` | Upload files |
| `nsyte ls` | List published files |
| `nsyte download <dir>` | Download files |
| `nsyte bunker <action>` | Manage NIP-46 bunkers |

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
Create and use a new NOSTR key pair.

### 2. Existing Private Key
Use your own NOSTR private key.

### 3. NOSTR Bunker (NIP-46)
Recommended for maximum security - keep keys on a separate device.

```bash
# Connect to bunker
nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'

# Alternative syntax to avoid shell escaping issues
nsyte bunker connect --pubkey <pubkey> --relay <relay> --secret <secret>

# List bunkers
nsyte bunker list
```

## Security

**Private Keys**: Never exposed to servers, stored in project configuration.

**Bunker Connections**: 
- Uses NIP-46 protocol for remote signing
- Connection secrets stored in system-specific locations:
  - Linux: `~/.config/nsite`
  - macOS: `~/Library/Application Support/nsite`
  - Windows: `%APPDATA%\nsite`

**nbunksec Strings**: 
- Contain sensitive key material
- Must be stored securely in CI/CD environments
- Should be rotated periodically

## CI/CD Integration

Use nbunksec string to authenticate in CI/CD pipelines:

```bash
# LOCAL SYSYEM ----->
nsyte bunker connect bunker://...
nsyte bunker export (copy the nbunksec)
nsyte bunker remove 

# CI/CD Workflow ----->
# add nbunksec as secret in CI/CD system
nsyte upload ./dist --nbunksec ${NBUNK_SECRET}
```

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

- Deno 1.40.5 or higher

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
