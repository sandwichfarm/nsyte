---
title: ls
description: List files available on the nostr network
---

# ls

List files available on the nostr network for a given public key. This command shows which files
have been published to nostr relays and indicates which files would be ignored based on local
`.nsyte-ignore` rules.

## Usage

```bash
nsyte ls [options]
```

## Options

- `-r, --relays <relays>` — The nostr relays to use (comma separated). If not specified, uses relays
  from project config or default discovery relays
- `-k, --privatekey <nsec>` — The private key (nsec/hex) to use for authentication
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

## Authentication

The `ls` command supports multiple authentication methods:

1. **Explicit pubkey** - Use `--pubkey` to list files for any public key
2. **Private key** - Use `--privatekey` to authenticate with your private key
3. **Project bunker** - Uses the bunker configured in `.nsite/config.json`
4. **Interactive mode** - If no key is provided, you'll be prompted to:
   - Generate a new private key
   - Enter an existing private key
   - Use an existing NSEC bunker
   - Connect to a new NSEC bunker (redirects to `nsyte bunker connect`)

## Ignore Rules

Files marked in red in the output would be ignored during upload based on:

- Default ignore patterns (`.git/**`, `node_modules/**`, etc.)
- Custom patterns in `.nsyte-ignore` file
- Implicit dotfile ignoring (except `.well-known/`)

This helps you understand which remote files would not be re-deployed in a subsequent `nsyte deploy`
command.
