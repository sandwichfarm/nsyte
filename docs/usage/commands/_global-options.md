---
title: Global Options
description: Options inherited by every nsyte subcommand
---

# Global Options

These options are declared on the root `nsyte` command (via Cliffy's `globalOption`) and are
inherited by every subcommand. They are accepted in addition to each command's own flags.

To keep the per-command pages focused, these globals are documented here once. Each command page
ends with a short reference line pointing back to this page; the per-command Options sections list
only the flags specific to that command.

## Options

- `-c, --config <path>` — Path to config file (default: `.nsite/config.json`)
- `--created-at <timestamp>` — Override `created_at` on nostr events. Accepts Unix epoch seconds or
  an ISO 8601 datetime.

### `-c, --config`

The config file holds project defaults: configured relays, blossom servers, optional bunker
reference, optional profile, and the site identifier. The default location, `.nsite/config.json`,
is created the first time you run [`nsyte init`](init.md). Pointing `--config` at a different file
lets a single working directory drive multiple deployments without reconfiguring the project.

### `--created-at`

Sets the `created_at` timestamp on nostr events that the command publishes (file events, manifest
events, profile events, relay/server lists, app handler events). Two input formats are accepted:

- Unix epoch seconds, e.g. `1714752000`
- ISO 8601 datetime, e.g. `2026-05-03T12:00:00Z`

Useful for reproducible deploys, snapshot reconstruction, and aligning multiple events to the same
moment. Note that authentication events used to talk to blossom servers are generated at the time
of the request and are not affected by this flag — only the nostr events the command publishes use
the override.

## See Also

- [`nsyte init`](init.md) — initialize a new project (creates the default config file)
- [`nsyte deploy`](deploy.md) — deploy a directory to relays and blossom servers
- [`nsyte validate`](validate.md) — validate a config file against the schema
