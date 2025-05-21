---
title: download
description: Download files from the nostr network
---

# download

Download files from the nostr network for a given public key.

## Usage

```bash
nsyte download [options]
```

## Options

- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `-k, --privatekey <nsec>` — The private key (nsec/hex) to use for signing
- `-b, --bunker <url>` — The NIP-46 bunker URL to use for signing
- `-p, --pubkey <npub>` — The public key to download files from (if not using private key)
- `-o, --output <dir>` — The output directory to save files to (required)

## Examples

Download files to the `backup` directory:
```bash
nsyte download --output backup
```

Download files for a specific public key:
```bash
nsyte download --pubkey npub1... --output backup
```

Download files using a private key and custom relays:
```bash
nsyte download --privatekey nsec1... --relays wss://relay.example --output backup
``` 