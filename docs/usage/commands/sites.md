---
title: sites
description: List all root and named sites published by a pubkey
---

# `nsyte sites`

List all root and named sites published by a pubkey, showing titles, descriptions, file counts, and
update times. This gives you an overview of all sites associated with a public key.

## Usage

```bash
nsyte sites [options]
```

## Options

- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or
  64-char hex)
- `-p, --pubkey <npub>` — The public key to list sites for (npub, hex, or NIP-05 identifier like
  `name@domain.com`)
- `--use-fallback-relays` — Include default nsyte relays in addition to configured/user relays
- `--use-fallbacks` — Enable all fallbacks (currently only relays for this command)

## Examples

### List Sites for Current Project

```bash
nsyte sites
```

Uses the pubkey from your project configuration.

### List Sites for a Specific Pubkey

```bash
nsyte sites --pubkey npub1abc123...
```

### List Sites Using NIP-05 Identifier

```bash
nsyte sites --pubkey user@domain.com
```

### List Sites with Custom Relays

```bash
nsyte sites --relays wss://relay1.com,wss://relay2.com
```

## Output

The command displays each site with:

- **Type**: `ROOT` (kind 15128) or `NAMED:identifier` (kind 35128)
- **Title**: From the site manifest's `title` tag
- **Description**: From the site manifest's `description` tag
- **File count**: Number of files in the manifest
- **Updated**: When the manifest was last published
- **Event ID**: The Nostr event ID of the manifest

Sites are sorted by most recently updated first.

## Root Sites vs Named Sites

- **Root site** (kind 15128): A single replaceable event per pubkey. This is the default site.
- **Named sites** (kind 35128): Addressable events with a `d` tag identifier. Multiple named sites
  can exist per pubkey (e.g., "blog", "docs", "portfolio").

## Difference from `list`

- `nsyte sites` shows all sites (root + named) for a pubkey as a high-level overview
- `nsyte list` shows the individual files within a specific site

## Related Commands

- [`nsyte list`](ls.md) — List files within a specific site
- [`nsyte deploy`](deploy.md) — Deploy files to create or update a site
- [`nsyte purge`](purge.md) — Remove a site
- [`nsyte debug`](debug.md) — Debug nsite configuration
