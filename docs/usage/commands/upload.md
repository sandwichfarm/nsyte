---
title: upload (DEPRECATED)
description: Legacy command - use deploy instead
---

# upload (DEPRECATED)

⚠️ **This command is deprecated and will be removed in a future version.**

Please use [`deploy`](deploy.md) instead.

## Migration

The `upload` command has been renamed to `deploy` with identical functionality:

```bash
# Old (deprecated)
nsyte upload dist

# New (recommended)
nsyte deploy dist
```

All options and behaviors are the same. Simply replace `upload` with `deploy` in your commands and scripts.

## Why the Change?

The command was renamed to better reflect its purpose: deploying complete sites rather than just uploading files. The `deploy` command handles:

- Uploading files to blossom servers
- Publishing events to nostr relays
- Publishing metadata (profile, relay lists, app handlers)
- Managing site manifests

## See Also

- [`nsyte deploy`](deploy.md) - Deploy files to nostr relays and blossom servers
