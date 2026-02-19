---
title: download
description: Download files from the nostr network
---

# download

Download files from the nostr network for a given public key.

**Aliases:** `dl`

## Usage

```bash
nsyte download [options]
```

## Options

- `-o, --output <dir>` — The output directory to save files to (default: `./downloads`)
- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `-s, --servers <servers>` — The blossom servers to use (comma separated)
- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or
  64-char hex)
- `-p, --pubkey <npub>` — The public key to download files from (npub, hex, or NIP-05 identifier)
- `-d, --name <name>` — Site identifier for named sites (kind 35128). If not provided, downloads
  from root site (kind 15128)
- `--overwrite` — Overwrite existing files (default: false)
- `-v, --verbose` — Verbose output (default: false)

## Examples

Download files to the default `./downloads` directory:

```bash
nsyte download
```

Download files to a specific directory:

```bash
nsyte download --output backup
```

Download files for a specific public key:

```bash
nsyte download --pubkey npub1... --output backup
```

Download files using a NIP-05 identifier:

```bash
nsyte download --pubkey user@domain.com --output backup
```

Download a named site:

```bash
nsyte download --name blog --output backup
```

Download and overwrite existing files:

```bash
nsyte download --output backup --overwrite
```
