---
title: download
description: Download files from the nostr network
---

# download

Download files from the nostr network for a given public key.

## Usage

```bash
nsyte download [options]
```

## Options

- `-o, --output <dir>` — Output directory to save files (default: `./downloads`)
- `-r, --relays <relays>` — Nostr relays to query (comma-separated)
- `-s, --servers <servers>` — Blossom servers to download from (comma-separated)
- `--sec <secret>` — Secret for signing (auto-detects: nsec, nbunksec, bunker://, hex)
- `-p, --pubkey <npub>` — Public key to download files from (npub or hex)
- `-d, --name <name>` — Site identifier for named sites. If not provided, downloads root site
- `--overwrite` — Overwrite existing files (default: false)
- `-v, --verbose` — Verbose output showing detailed download progress (default: false)
- `--use-fallback-relays` — Include default nsyte relays for discovery
- `--use-fallback-servers` — Include default blossom servers for downloading
- `--use-fallbacks` — Enable both fallback relays and servers

## Examples

Download files to default directory (`./downloads`):

```bash
nsyte download
```

Download to custom directory:

```bash
nsyte download -o ./backup
```

Download files for a specific public key:

```bash
nsyte download -p npub1... -o ./backup
```

Download a named site:

```bash
nsyte download -d blog -o ./blog-backup
```

Download with overwrite enabled:

```bash
nsyte download -o ./backup --overwrite
```

Download using fallback relays and servers:

```bash
nsyte download --use-fallbacks -o ./backup
```

Download with verbose output:

```bash
nsyte download -v -o ./backup
```

## How it Works

1. **Discovers site**: Queries relays for site manifest (kind 15128 or 35128)
2. **Fetches file list**: Retrieves all files from the manifest
3. **Auto-discovers servers**: If not specified, uses servers from manifest and fallbacks
4. **Downloads concurrently**: Downloads up to 3 files in parallel
5. **Preserves structure**: Recreates directory structure in output folder
6. **Skips existing**: By default, won't overwrite existing files unless `--overwrite` is used

## Performance

- **Concurrent downloads**: Downloads 3 files at a time by default
- **Smart skipping**: Skips files that already exist (unless `--overwrite`)
- **Multiple sources**: Tries multiple blossom servers for reliability
- **Progress tracking**: Shows download progress with file counts

## Output Summary

After downloading, displays:

- **Success count**: Files successfully downloaded
- **Skipped count**: Files that already existed
- **Failed count**: Files that couldn't be downloaded
- **Saved paths**: List of all downloaded file paths

## Authentication

Authentication is optional for downloading public files. Provide authentication if:

- Downloading from private/restricted relays
- Need to access gated content
- Want to use project-configured relays

Use `--sec` with any supported format or rely on project config bunker.

## See Also

- [`nsyte deploy`](deploy.md) - Deploy files to the network
- [`nsyte ls`](ls.md) - List files before downloading
- [`nsyte browse`](browse.md) - Interactive file browser
- [`nsyte sites`](sites.md) - List all sites for a pubkey
