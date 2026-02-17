---
title: deploy
description: Deploy files from a directory to relays and blossom servers
---

# deploy

Deploy files from a directory to configured relays and blossom servers.

## Usage

```bash
nsyte deploy <folder> [options]
```

- `<folder>`: The directory to deploy (required)

## Options

- `-f, --force` — Force publishing even if no changes were detected (default: false)
- `-s, --servers <servers>` — The blossom servers to use (comma separated)
- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `-k, --privatekey <nsec>` — The private key (nsec/hex) to use for signing
- `-b, --bunker <url>` — The NIP-46 bunker URL to use for signing
- `--sec <nbunksec>` — The NIP-46 bunker encoded as nbunksec
- `-p, --purge` — Delete online file events that are not used anymore (default: false)
- `-v, --verbose` — Verbose output (default: false)
- `-c, --concurrency <number>` — Number of parallel uploads (default: 4)
- `--publish-profile` — Publish profile metadata (Kind 0) - **root sites only** (default: false)
- `--publish-relay-list` — Publish relay list (Kind 10002) - **root sites only** (default: false)
- `--publish-server-list` — Publish Blossom server list (Kind 10063) - **root sites only** (default: false)
- `--publish-app-handler` — Publish NIP-89 app handler announcement (Kind 31990) (default: false)
- `--handler-kinds <kinds>` — Event kinds this nsite can handle (comma separated)
- `--fallback <file>` — An HTML file to copy and publish as 404.html
- `-i, --non-interactive` — Run in non-interactive mode (default: false)

## Examples

Deploy the `dist` directory:

```bash
nsyte deploy dist
```

Deploy with custom relays and servers:

```bash
nsyte deploy dist --relays wss://relay.example --servers https://server.example
```

Deploy with force and purge options:

```bash
nsyte deploy dist --force --purge
```

Deploy with metadata events:

```bash
nsyte deploy dist --publish-profile --publish-relay-list --publish-server-list
```

Deploy with app handler announcement:

```bash
nsyte deploy dist --app-handler --handler-kinds "1,30023,30311"
```

## How it Works

The deploy command:

1. **Scans** your local directory for files
2. **Compares** with previously deployed files (using SHA256 hashes)
3. **Uploads** only changed or new files to Blossom servers
4. **Publishes** file events (NIP-96) to configured relays
5. **Optionally publishes** metadata events for discovery

## Authentication

The deploy command requires authentication to sign nostr events. You can provide authentication
through:

1. **Private key**: Use `--privatekey` with an nsec or hex key
2. **Bunker**: Use `--bunker` with a bunker URL
3. **nbunksec**: Use `--sec` with an encoded bunker secret
4. **Project config**: If configured during `nsyte init`

## Performance

- **Smart diffing**: Only uploads changed files
- **Parallel uploads**: Use `--concurrency` to control parallel uploads
- **Progress tracking**: Shows upload progress with visual indicators

## Metadata Publishing

**Important**: Profile, relay list, and server list can only be published from **root sites** (where
`id` is `null` or empty in your config). These are user-level metadata and cannot be published from
named sites to prevent conflicts.

### Profile (Kind 0) - Root Sites Only

Use `--publish-profile` to publish your Nostr profile metadata. Configure the profile data in your
`.nsite/config.json`:

```json
{
  "id": null,
  "publishProfile": true,
  "profile": {
    "name": "Your Name",
    "about": "Description",
    "picture": "https://example.com/avatar.jpg"
  }
}
```

### Relay List (Kind 10002) - Root Sites Only

Use `--publish-relay-list` to publish your outbox relays (NIP-65). This publishes all relays from
your config as write-only (outbox) relays:

```bash
nsyte deploy dist --publish-relay-list
```

### Server List (Kind 10063) - Root Sites Only

Use `--publish-server-list` to publish your Blossom servers. This helps clients know where to
download your media files:

```bash
nsyte deploy dist --publish-server-list
```

### App Handler (Kind 31990)

Use `--publish-app-handler` to announce your nsite as a NIP-89 application handler. This works for
both root and named sites. Specify which event kinds your app can handle with `--handler-kinds`:

```bash
nsyte deploy dist --publish-app-handler --handler-kinds "1,30023"
```

## Error Handling

- **Network errors**: Automatically retried with exponential backoff
- **Authentication errors**: Clear messages about missing or invalid credentials
- **Upload failures**: Detailed error messages for each failed file
- **Relay rejections**: Shows which relays accepted or rejected events

## See Also

- [`nsyte init`](init.md) - Initialize a new nsyte project
- [`nsyte ls`](ls.md) - List deployed files
- [`nsyte browse`](browse.md) - Interactive file browser
- [`nsyte purge`](purge.md) - Remove deployed files
- [`nsyte serve`](serve.md) - Serve files locally for testing
