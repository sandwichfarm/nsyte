---
title: init
description: Initialize a new nsyte site
---

# init

Initialize a new nsyte site in the current directory.

## Description

The `init` command runs an interactive setup wizard that walks you through:

1. Choosing how to manage your nostr key (generate a new key, use an existing
   `nsec`, or connect/select an NSEC bunker)
2. Choosing a root or named site (and, for named sites, an identifier)
3. Entering an optional site title and description
4. Adding your nostr relay and blossom server URLs

It then writes the resulting `.nsite/config.json`. If an invalid config already
exists, `init` offers to overwrite it.

## Usage

```bash
nsyte init
```

## Options

This command has no per-command options. See [global options](_global-options.md).

## Examples

Basic initialization:

```bash
nsyte init
```

## Configuration

The wizard writes a `.nsite/config.json` reflecting your answers, for example:

```json
{
  "$schema": "https://nsyte.run/schemas/config.schema.json",
  "bunkerPubkey": "abc123...",
  "relays": ["wss://relay.damus.io"],
  "servers": ["https://cdn.hzrd149.com"],
  "id": "blog",
  "title": "My Blog",
  "description": "A blog about decentralized applications"
}
```

A private key is never stored in the config — if you generate or supply an `nsec`,
it is shown once and you must save it yourself. See the
[configuration reference](../configuration.md) for all available fields.

## Project Structure

After initialization, your project will have this structure:

```
.
└── .nsite/
    └── config.json
```

`init` only creates the `.nsite/` directory and `config.json`. Add a `.nsyte-ignore` file by hand if
you need to exclude files from deployment.

## Next Steps

After initialization:

1. Configure your [relays and servers](../configuration.md#relays-and-servers)
2. Set up your [authentication](../configuration.md#authentication)
3. Start [building your site](../index.md#building-your-site)

Inherits global options. See [global options](_global-options.md).
