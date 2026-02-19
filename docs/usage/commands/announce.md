---
title: announce
description: Publish app handler announcements to Nostr
---

# `nsyte announce`

Publish NIP-89 app handler announcements to Nostr relays. This is a standalone command for
publishing app handler metadata without performing a full deploy.

**Aliases:** `annc`

## Usage

```bash
nsyte announce [options]
```

## Options

- `--publish-app-handler` — Publish app handler information (Kind 31990)
- `--all` — Publish all available data
- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or
  64-char hex)

## Examples

### Publish App Handler

```bash
nsyte announce --publish-app-handler
```

### Publish All Available Announcements

```bash
nsyte announce --all
```

### Publish with Specific Credentials

```bash
nsyte announce --publish-app-handler --sec nsec1...
```

## How It Works

1. Reads the app handler configuration from `.nsite/config.json`
2. Discovers the user's outbox relays (kind 10002)
3. Publishes the app handler announcement (kind 31990) to config relays, discovery relays, and the
   user's outbox relays

## Configuration

The announce command reads app handler settings from your `.nsite/config.json`:

```json
{
  "publishAppHandler": true,
  "appHandler": {
    "kinds": [1, 30023],
    "name": "My Event Viewer",
    "description": "Views notes and articles"
  }
}
```

## When to Use

Use `announce` when you want to publish or update app handler metadata without re-deploying your
site files. This is useful when:

- You've changed your `appHandler` configuration and want to update the announcement
- You want to publish app handler metadata independently of file deployments

For publishing app handlers as part of a deploy, use
`nsyte deploy <dir> --publish-app-handler` instead.

## Related Commands

- [`nsyte deploy`](deploy.md) — Deploy files (can also publish app handlers with
  `--publish-app-handler`)
- [`nsyte debug`](debug.md) — Check if app handler events are published
