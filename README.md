> ⚠️ nsyte is alpha. there may be things broken. docs may be incorrect. things will change. use at your own risk.

# nsyte

![Coverage](./static/coverage-badge.svg) ![Line Coverage](./static/coverage-lines-badge.svg)
![Branch Coverage](./static/coverage-branches-badge.svg)

A command-line tool for publishing nsites to nostr and Blossom servers. Enables decentralized,
censorship-resistant website hosting.


## Key Features

- 🚀 **Fast & Efficient** - Concurrent uploads with smart diffing
- 🔍 **Discoverable** - Publish valid profile, relay list, and server lists so your nsite is discoverable.
- 🔐 **Secure Authentication** - Support for NIP-46 bunkers and private keys
- 🔄 **Smart Release Management** - Append, replace, or skip artifacts intelligently
- 🛡️ **Secure Key Storage** - Platform-specific secure storage for sensitive data
- 🤖 **CI/CD Ready** - Revocable key support and non-interactive command line for CI.

### Additional Features

- 📦 **NIP-94/NIP-82 Release Artifacts** - Create versioned releases with application metadata and platform detection
- 🎯 **NIP-89 App Handler** - Announce which event kinds your nsite can handle

[What's an nsite?](https://nsite.run)

> nsyte is a fork of [nsite-cli](https://github.com/flox1an/nsite-cli) by
> florian [github](https://github.com/flox1an) [npub](https://njump.me/npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc).
> nsyte has been ported to deno and rewritten in the process. 

![nsyte screen demo](./static/nsyte.gif)

## Quick Start

```bash
# Install from JSR
curl -fsSL https://nsyte.run/get/install.sh | bash

# Initialize project (interactive setup)
nsyte init

# Deploy website
nsyte deploy ./dist
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

| Command                 | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `nsyte`                 | Interactive setup wizard                         |
| `nsyte init`            | Initialize configuration                         |
| `nsyte deploy <dir>`    | Deploy files                                     |
| `nsyte ls`              | List published files                             |
| `nsyte browse`          | Interactive TUI browser for files                |
| `nsyte download <dir>`  | Download files                                   |
| `nsyte run`             | Run resolver server with npub subdomains         |
| `nsyte serve -d <div>`  | Serve local nsite files from directory (current dir is default)           |
| `nsyte debug <npub>`    | Debug an nsite by checking relays and servers    |
| `nsyte validate`        | Validate configuration file                      |
| `nsyte purge`           | Remove published files                           |
| `nsyte ci`              | Generate CI/CD credentials (nbunksec)            |
| `nsyte bunker <action>` | Manage NIP-46 bunkers                            |

### Deploying Files

```bash
# Basic deploy
nsyte deploy ./dist

# With options
nsyte deploy ./dist --force --concurrency 8 --verbose

# With metadata publishing
nsyte deploy ./dist --publish-profile --publish-relay-list --publish-server-list

# With NIP-89 app handler
nsyte deploy ./dist --app-handler --handler-kinds "1,30023"

# With NIP-94 release artifacts (auto-create archive)
nsyte deploy ./dist --publish-file-metadata --version v1.0.0

# With NIP-94 release artifacts (use existing archives)
nsyte deploy ./dist --publish-file-metadata --version v1.0.0 --release-artifacts dist.tar.gz,dist.zip
```

### Purging Files

The `purge` command removes published files from relays and optionally from Blossom servers:

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

#### Purge Options

- `--all`: Remove all published files for your pubkey
- `--paths <pattern>`: Remove files matching glob patterns (supports wildcards `*` and `?`)
- `--include-blobs`: Also delete blobs from Blossom servers
- `--yes`: Skip confirmation prompts
- `--relays <relays>`: Override relays to use (comma-separated)
- `--servers <servers>`: Override Blossom servers to use (comma-separated)

#### Pattern Examples

```bash
# Remove all HTML files
nsyte purge --paths "*.html"

# Remove all files in a directory
nsyte purge --paths "/static/*"

# Remove all CSS files recursively
nsyte purge --paths "**/*.css"

# Remove specific files
nsyte purge --paths "/index.html" --paths "/about.html"
```

**Note**: The purge command creates NIP-09 delete events. Some relays may not honor delete requests, and it may take time for deletions to propagate.

### Debugging nsites

The `debug` command helps diagnose issues with nsite setup by checking various components:

```bash
# Debug current project's nsite
nsyte debug

# Debug a specific npub
nsyte debug npub1abc123...

# Debug with custom relays
nsyte debug --relays wss://relay1.com,wss://relay2.com

# Verbose output with detailed information
nsyte debug --verbose
```

The debug command checks:
- **Profile (kind 0)**: Verifies user profile exists on relays
- **Relay list (kind 10002)**: Finds user's preferred relays
- **Blossom server list (kind 10063)**: Discovers blob storage servers and tests availability
- **nsite events (kind 34128)**: Checks for uploaded files
- **App handler events (kinds 31989, 31990)**: Looks for app announcements
- **Blob integrity**: Downloads random files to verify hash correctness

### Local Development

```bash
# Serve local files for development
nsyte serve

# Run resolver server for testing npub subdomains
nsyte run
```

The `serve` command builds and serves your local nsite files, while `run` starts a resolver server that can serve nsites via npub subdomains (e.g., `npub123.localhost`).

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

# Migrate/rebuild bunker index (macOS)
nsyte bunker migrate
```

#### Bunker Migration (macOS)

On macOS, nsyte uses a two-tier storage system for bunkers:
- **Keychain**: Stores actual credentials securely
- **Index**: Tracks which bunkers are available (for listing)

If you see warnings about rebuilding the keychain index, run:

```bash
# Automatically discover and migrate all bunkers
nsyte bunker migrate

# Migrate specific bunkers if auto-discovery fails
nsyte bunker migrate <pubkey1> <pubkey2>
```

## Security

**Private Keys**: Never exposed to servers, stored in project configuration.

**Secure Credential Storage**:

nsyte uses a multi-tier security approach for storing sensitive bunker connection data:

- **Tier 1 (Best)**: Native OS keychain services:
  - macOS: Keychain Services via `security` command
  - Windows: Credential Manager via `cmdkey`/PowerShell
  - Linux: Secret Service API via `libsecret`/`secret-tool`
- **Tier 2 (Good)**: AES-256-GCM encrypted file storage when native keychain unavailable
- **Tier 3 (Fallback)**: Plain JSON storage with security warnings

**Linux-Specific Information**:

On Linux systems, nsyte will automatically use the most secure available option:

1. **With libsecret installed** (recommended):
   - Install: `sudo apt-get install libsecret-tools` (Ubuntu/Debian)
   - Install: `sudo dnf install libsecret` (Fedora)
   - Install: `sudo pacman -S libsecret` (Arch)
   - Requires a running keyring service (GNOME Keyring, KDE Wallet, etc.)
   - Credentials stored securely in system keyring

2. **Without libsecret** (automatic fallback):
   - Uses AES-256-GCM encrypted file storage
   - Encryption key derived from system attributes
   - Credentials stored in `~/.config/nsyte/secrets.enc`
   - No external dependencies required

3. **Troubleshooting Linux keystore**:
   - Run `deno run -A scripts/debug-linux-keystore.ts` to diagnose issues
   - Common issues:
     - Missing `secret-tool`: Install libsecret-tools package
     - No D-Bus session: Ensure running in desktop environment
     - Keyring not running: Start GNOME Keyring or KDE Wallet

**Storage Locations**:

- Secure storage: Platform-specific keychain or encrypted files
- Config directories:
  - Linux: `~/.config/nsyte` (or `$XDG_CONFIG_HOME/nsyte`)
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
nsyte deploy ./dist --nbunksec ${NBUNK_SECRET}
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
      - run: nsyte deploy ./dist --nbunksec ${{ secrets.NBUNK_SECRET }}
```

## Configuration

Configuration is stored in `.nsite/config.json`. A complete [JSON Schema](src/schemas/config.schema.json) is available for validation and editor support.

```json
{
  "$schema": "https://nsyte.run/schemas/config.schema.json",
  "bunkerPubkey": "abc123...",
  "fallback": "/index.html",
  "publishProfile": false,
  "publishServerList": true,
  "publishRelayList": true,
  "publishAppHandler": true,
  "relays": ["wss://relay1", "wss://relay2"],
  "servers": ["https://server1", "https://server2"],
  "profile": { "name": "My Site", "about": "Description" },
  "appHandler": {
    "kinds": [1, 30023],
    "name": "My Event Viewer",
    "description": "Views notes and articles"
  }
}
```

### Configuration Validation

Validate your configuration file:

```bash
# Validate the current project config
nsyte validate

# Validate a specific config file
nsyte validate --file path/to/config.json

# Show schema location
nsyte validate --schema
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

### NIP-89 App Handler

nsyte supports [NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md) app handler announcements, allowing your nsite to be discovered as a viewer for specific Nostr event types.

**Configuration:**
- `publishAppHandler`: Enable app handler announcements
- `appHandler.kinds`: Array of event kind numbers this nsite can display
- `appHandler.name`: Optional display name for your handler
- `appHandler.description`: Optional description
- `appHandler.platforms`: Platform-specific handler configurations (web, android, ios, etc.)

**Command Line:**
```bash
# Publish app handler for specific event kinds
nsyte deploy ./dist --app-handler --handler-kinds "1,30023,30311"
```

When enabled, other Nostr clients can suggest your nsite when users encounter the specified event types.

## Advanced Usage

### Bunker Command Options

```bash
# Connect to a bunker (interactive)
nsyte bunker connect

# Connect with bunker URL
nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'

# Connect with individual parameters
nsyte bunker connect --pubkey <pubkey> --relay <relay> --secret <secret>

# List all stored bunkers
nsyte bunker list

# Import an nbunksec string
nsyte bunker import nbunk1q...

# Export bunker as nbunksec
nsyte bunker export <pubkey>

# Configure project to use specific bunker
nsyte bunker use <pubkey>

# Remove a bunker
nsyte bunker remove <pubkey>

# Migrate/rebuild bunker index (macOS)
nsyte bunker migrate
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
nsyte deploy ./dist --fallback=/index.html
```

## Troubleshooting

### Linux Credential Storage Issues

If credentials aren't persisting on Linux:

1. **Check keystore availability**:
   ```bash
   deno run -A scripts/debug-linux-keystore.ts
   ```

2. **Install libsecret** (recommended):
   ```bash
   # Ubuntu/Debian
   sudo apt-get install libsecret-tools gnome-keyring

   # Fedora
   sudo dnf install libsecret gnome-keyring

   # Arch
   sudo pacman -S libsecret gnome-keyring
   ```

3. **Using encrypted file storage**:
   - If libsecret isn't available, nsyte automatically uses encrypted files
   - Check `~/.config/nsyte/secrets.enc` exists after storing credentials
   - Ensure consistent hostname and username (used for encryption key)

4. **Force encrypted storage** (for testing):
   ```bash
   # Using environment variable
   export NSYTE_FORCE_ENCRYPTED_STORAGE=true
   nsyte bunker connect
   
   # Or using CLI argument
   nsyte bunker connect --force-encrypted-storage
   ```

### Common Issues

- **"Bunker connection lost"**: Check relay connectivity and bunker availability
- **"Failed to store credential"**: Ensure keyring service is running or encrypted storage is writable
- **"No such interface" (Linux)**: Start GNOME Keyring or KDE Wallet service
- **Credentials lost after reboot**: Check if system attributes (hostname, username) changed

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

# Build website (includes docs)
deno task site:build
```

### Building Documentation

The website build includes MkDocs documentation. On first run, the build script will automatically set up the Python environment. You can also manually set it up:

```bash
# Set up documentation environment (auto-runs on first site:build)
./scripts/setup-docs.sh

# Serve docs locally for development
./scripts/serve-docs.sh

# Build docs only
./scripts/build-docs.sh
```

## Resources

- [nsite.run](https://nsite.run)
- [awesome-nsite](https://github.com/nostrver-se/awesome-nsite)

## License

[MIT License](LICENSE)
