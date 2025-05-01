# nsite-cli

A powerful CLI tool for publishing static websites on NOSTR in a decentralized and censorship-resistant way.

- Website file listings are published as events (Kind 34128) on NOSTR relays
- Binary files are uploaded to blossom servers
- All data is signed with your private key, making it tamper-proof

## Features

- **Interactive Setup**: Guided setup to configure your project
- **Key Management**: Multiple options for managing your NOSTR keys
  - Generate a new key
  - Use an existing key
  - Use a NIP-46 bunker for secure remote signing
- **Fast Uploads**: Parallel uploads for better performance
- **Smart File Detection**: Automatically detects files that already exist online
- **Colorful Terminal UI**: Progress bars and colorized output
- **Cross-Platform**: Works on macOS, Linux, and Windows

## Installation

### Using Deno

```bash
# Install directly from GitHub
deno install --allow-read --allow-write --allow-net --allow-env -n nsite-cli https://raw.githubusercontent.com/username/nsite-cli/main/src/cli.ts
```

### Using Pre-built Binaries

Download the appropriate binary for your system from the [Releases](https://github.com/username/nsite-cli/releases) page.

## Quick Start

### Interactive Mode (Recommended)

Running nsite-cli without any subcommand starts the interactive setup:

```bash
nsite-cli
```

This guides you through:
- Setting up your key management
- Configuring relays and blossom servers
- Setting profile information

### Uploading a Website

```bash
# Upload a website interactively
nsite-cli upload ./www

# Upload with specific options
nsite-cli upload ./www --concurrency 8 --verbose

# Force upload even if files are already online
nsite-cli upload ./www --force
```

### Listing Files

```bash
# List your own files
nsite-cli ls

# List files from another user
nsite-cli ls npub1abc123...
```

### Downloading Files

```bash
# Download files from another user
nsite-cli download ./target-folder npub1abc123...
```

## Key Management

### Using Private Keys

Your private key is used to sign events but is never sent to any server. You can:

```bash
# Use from config file (created during interactive setup)
nsite-cli upload ./www

# Specify directly (not recommended)
nsite-cli upload ./www --privatekey nsec1abc123...
```

### Using NSEC Bunkers (NIP-46)

For enhanced security, you can use a NIP-46 remote signer:

```bash
# Configure a bunker during interactive setup
nsite-cli

# Specify a bunker URL directly
nsite-cli upload ./www --bunker bunker://pubkey?relay=wss://relay.example.com&secret=abc123
```

## Configuration Options

nsite-cli stores its configuration in a `.nsite/config.json` file in your project directory:

```json
{
  "privateKey": "your-private-key",  // Only one of privateKey or bunkerUrl will be set
  "bunkerUrl": "bunker://...",       // NIP-46 bunker URL
  "relays": ["wss://relay1", "wss://relay2"],
  "servers": ["https://server1", "https://server2"],
  "profile": {
    "name": "My Website",
    "about": "Description of my website"
  },
  "publishServerList": true,
  "publishRelayList": true,
  "publishProfile": true
}
```

## Advanced Usage

### Deep Linking in Single Page Applications

For deep linking with browser-based routing (e.g., React Router), use the `--fallback` option:

```bash
nsite-cli upload ./dist --fallback=/index.html
```

This creates a copy of the specified file as `/404.html`.

### Environment Variables

You can use environment variables for configuration:

```bash
export NSITE_LOG_LEVEL=debug  # For debug-level logging
```

### Non-Interactive Mode

For automated scripts, you can use non-interactive mode:

```bash
nsite-cli upload ./www --non-interactive --privatekey nsec1abc123...
```

### Recent Improvements

- **Smart Existing File Detection**: The tool now correctly identifies files that are already uploaded and avoids unnecessary re-uploads
- **Improved Progress Tracking**: Progress now correctly tracks files, not server operations
- **Better Success Reporting**: Separate tracking for file uploads vs. NOSTR event publication
- **Enhanced Error Handling**: More informative error messages and better recovery from common issues

## Development

### Prerequisites

- [Deno](https://deno.land/) 1.40.5 or higher

### Building from Source

```bash
# Clone the repository
git clone https://github.com/username/nsite-cli.git
cd nsite-cli

# Run the development version
deno task dev

# Run tests
deno task test

# Build binaries
deno task compile      # For current platform
deno task compile:all  # For all platforms
```

### Known Issues and Workarounds

**Deno version compatibility**: The current version works best with Deno v1.40.5. If you encounter errors related to import assertions, you can:

```bash
# Downgrade Deno version
deno upgrade --version 1.40.5

# Remove the lockfile and recompile
rm -f deno.lock
deno task compile
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License 