---
title: ls
description: List files available on the nostr network
---

# ls

List files available on the nostr network for a given public key.

## Usage

```bash
nsyte ls [options]
```

## Options

- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `-k, --privatekey <nsec>` — The private key (nsec/hex) to use for signing
- `-p, --pubkey <npub>` — The public key to list files for (if not using private key)

## Examples

List files using project config:
```bash
nsyte ls
```

List files for a specific public key:
```bash
nsyte ls --pubkey npub1... --relays wss://relay.example
```

List files using a private key:
```bash
nsyte ls --privatekey nsec1...
``` 