---
title: sites
description: List all published sites for a pubkey
---

# sites

List all published sites (both root and named) for a given public key.

## Usage

```bash
nsyte sites [options]
```

## Options

- `-r, --relays <relays>` — Nostr relays to query (comma-separated)
- `--sec <secret>` — Secret for signing (auto-detects: nsec, nbunksec, bunker://, hex)
- `-p, --pubkey <npub>` — Public key to list sites for (npub or hex format)
- `--use-fallback-relays` — Include default nsyte relays in addition to configured relays
- `--use-fallbacks` — Enable all fallback options (relays)

## Examples

List your own sites (using project config):

```bash
nsyte sites
```

List sites for a specific public key:

```bash
nsyte sites -p npub1...
```

List sites with custom relays:

```bash
nsyte sites -r wss://relay.example.com,wss://relay2.example.com
```

Use fallback relays for discovery:

```bash
nsyte sites --use-fallbacks
```

## Output

The sites command displays:

- **Site type**: "ROOT" for root sites (kind 15128) or "NAMED:<identifier>" for named sites (kind 35128)
- **Title**: Site title from metadata
- **Description**: Site description from metadata
- **File count**: Number of files in the site
- **Last update**: Time since last modification

Sites are sorted by most recent update.

## Site Types

### Root Site

The default site for a pubkey (kind 15128). Every pubkey can have one root site, which represents the user's main identity. The root site has no identifier (d tag is empty).

### Named Sites

Additional sites with unique identifiers (kind 35128). A pubkey can have multiple named sites, each with a unique identifier like `blog`, `docs`, `portfolio`, etc.

## How it Works

1. Fetches user's outbox relays from NIP-65 (kind 10002)
2. Merges configured relays with discovered outbox relays
3. Queries for both root site (kind 15128) and named site (kind 35128) manifests
4. Displays metadata and file counts for each site

## See Also

- [`nsyte browse`](browse.md) - Interactive file browser with site switching
- [`nsyte deploy`](deploy.md) - Deploy files to create or update sites
- [`nsyte ls`](ls.md) - List files in a specific site
- [`nsyte download`](download.md) - Download files from a site
