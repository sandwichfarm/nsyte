---
title: upload
description: Upload files from a directory to relays and blossom servers
---

# upload

Upload files from a directory to configured relays and blossom servers.

## Usage

```bash
nsyte upload <folder> [options]
```

- `<folder>`: The directory to upload (required)

## Options

- `-f, --force` — Force publishing even if no changes were detected (default: false)
- `-s, --servers <servers>` — The blossom servers to use (comma separated)
- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `-k, --privatekey <nsec>` — The private key (nsec/hex) to use for signing
- `-b, --bunker <url>` — The NIP-46 bunker URL to use for signing
- `--nbunksec <nbunksec>` — The NIP-46 bunker encoded as nbunksec
- `-p, --purge` — Delete online file events that are not used anymore (default: false)
- `-v, --verbose` — Verbose output (default: false)
- `-c, --concurrency <number>` — Number of parallel uploads (default: 4)
- `--publish-server-list` — Publish the list of blossom servers (Kind 10063) (default: false)
- `--publish-relay-list` — Publish the list of nostr relays (Kind 10002) (default: false)
- `--publish-profile` — Publish the app profile for the npub (Kind 0) (default: false)
- `--app-handler` — Publish NIP-89 app handler announcement (Kind 31990) (default: false)
- `--handler-kinds <kinds>` — Event kinds this nsite can handle (comma separated)
- `--publish-file-metadata` — Publish NIP-94 file metadata events for releases (default: false)
- `--version <version>` — Version tag for the release (required when using --publish-file-metadata)
- `--release-artifacts <paths>` — Comma-separated paths to existing archives to publish as release artifacts
- `--fallback <file>` — An HTML file to copy and publish as 404.html
- `-i, --non-interactive` — Run in non-interactive mode (default: false)

## Examples

Upload the `dist` directory:

```bash
nsyte upload dist
```

Upload with custom relays and servers:

```bash
nsyte upload dist --relays wss://relay.example --servers https://server.example
```

Force upload and purge deleted files:

```bash
nsyte upload dist --force --purge
```

Publish profile and relay/server lists:

```bash
nsyte upload dist --publish-profile --publish-relay-list --publish-server-list
```

Publish NIP-89 app handler announcement:

```bash
nsyte upload dist --app-handler --handler-kinds "1,30023,30311"
```

Publish release with NIP-94 file metadata:

```bash
# Auto-create archive from uploaded files
nsyte upload dist --publish-file-metadata --version v1.0.0

# Use existing archives
nsyte upload dist --publish-file-metadata --version v1.0.0 --release-artifacts dist.tar.gz,dist.zip
```

## Next Steps

- [Check deployment status](../../guides/deployment.md)
- [Configure relays and servers](../configuration.md#relays-and-servers)
