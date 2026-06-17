---
title: announce
description: Publish app handler events
---

# announce

> **Alias:** `annc` — `nsyte annc` is equivalent to `nsyte announce`.

Publish NIP-89 app handler announcements and other metadata events without
deploying files.

## Usage

```bash
nsyte announce [options]
```

## Options

- `--publish-app-handler` — Publish app handler information (Kind 31990)
- `--publish-app-recommendation` — Publish app recommendation (Kind 31989)
- `--all` — Publish all available data
- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec,
  bunker:// URL, or 64-char hex)
- `--dry-run` — Preview what would be announced without publishing (default:
  false)
- `--dry-run-output <dir>` — Directory to write dry-run event JSON files
- `--dry-run-show-kinds <kinds>` — Also print events of these kinds to stdout
  (comma-separated kind numbers)

## Examples

Publish app handler announcement:

```bash
nsyte announce --publish-app-handler
```

Publish all configured metadata:

```bash
nsyte announce --all
```

Use with specific authentication:

```bash
nsyte announce --publish-app-handler --sec nsec1...
```

Preview all configured metadata events:

```bash
nsyte announce --all --dry-run --dry-run-show-kinds 31990,31989
```

## How it Works

The announce command publishes metadata events to a combined relay set
consisting of:

1. **Configured relays** from your `.nsite/config.json`
2. **Discovery relays** (popular relays for maximum distribution)
3. **User's outbox relays** (from NIP-65 kind 10002 if available)

This ensures your announcements reach the widest possible audience across the
Nostr network.

## Use Cases

### Update App Handler Without Deploying

When you update your app handler configuration (supported event kinds,
platforms, etc.) but haven't changed your site files:

```bash
# Update config.json with new handler configuration
# Then announce the changes
nsyte announce --publish-app-handler
```

### Announce New Handler Capabilities

When your site gains support for new event kinds:

```bash
# Update appHandler.kinds in config.json
nsyte announce --publish-app-handler
```

### Standalone Metadata Publishing

Publish metadata events independently of file deployment for faster updates.

## Metadata Types

### App Handler (Kind 31990)

NIP-89 application handler announcement that tells Nostr clients your site can
handle specific event kinds. Configure in `.nsite/config.json`:

```json
{
  "publishAppHandler": true,
  "appHandler": {
    "kinds": [1, 30023],
    "name": "My Blog Viewer",
    "description": "A beautiful blog reader",
    "platforms": {
      "web": {
        "patterns": [{
          "url": "https://myblog.example.com/e/<bech32>",
          "entities": ["naddr"]
        }]
      }
    }
  }
}
```

## Relay Distribution

Shows success count summary after publishing:

```
Published app handler to 12/15 relays
```

## See Also

- [`nsyte deploy`](deploy.md) - Deploy files with optional metadata publishing
- [`nsyte debug`](debug.md) - Debug and verify published metadata
- [NIP-89 Handler Documentation](../../nip89-handler.md) - Complete app handler
  guide

Inherits global options. See [global options](_global-options.md).
