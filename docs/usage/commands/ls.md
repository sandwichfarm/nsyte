---
title: list
description: List files available on the nostr network
---

# list

List files available on the nostr network for a given public key. Shows which files have been
published via site manifest events and indicates which files would be ignored based on local
`.nsite-ignore` rules.

**Aliases:** `ls`

## Usage

```bash
nsyte list [path] [options]
```

- `[path]` (optional): Filter files by path prefix

## Options

- `-r, --relays <relays>` — The nostr relays to use (comma separated). If not specified, uses relays
  from project config or default discovery relays
- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or
  64-char hex)
- `-p, --pubkey <npub>` — The public key to list files for (npub, hex, or NIP-05 identifier like
  `name@domain.com`)
- `-d, --name <name>` — Site identifier for named sites (kind 35128). If not provided, lists root
  site (kind 15128)
- `--use-fallback-relays` — Include default nsyte relays in addition to configured/user relays
- `--use-fallbacks` — Enable all fallbacks (currently only relays for this command)

## Examples

List files using project config:

```bash
nsyte list
```

List files for a specific public key:

```bash
nsyte list --pubkey npub1... --relays wss://relay.example
```

List files using a NIP-05 identifier:

```bash
nsyte list --pubkey user@domain.com
```

List files for a named site:

```bash
nsyte list --name blog
```

Filter files by path:

```bash
nsyte list /assets
```

## Authentication

The `list` command supports multiple authentication methods:

1. **Explicit pubkey** — Use `--pubkey` to list files for any public key (supports npub, hex, or
   NIP-05 identifiers)
2. **Secret** — Use `--sec` with any supported format (nsec, nbunksec, bunker:// URL, or hex key)
3. **Project bunker** — Uses the bunker configured in `.nsite/config.json`
4. **Interactive mode** — If no key is provided, you'll be prompted

## Root Sites vs Named Sites

By default, `list` shows files for the root site (kind 15128). To list files for a named site, use
the `-d, --name` flag:

```bash
# List root site files
nsyte list

# List files for named site "blog"
nsyte list --name blog
```

To see all sites (both root and named) for a pubkey, use [`nsyte sites`](sites.md) instead.

## Ignore Rules

Files marked in red in the output would be ignored during upload based on:

- Default ignore patterns (`.git/**`, `node_modules/**`, etc.)
- Custom patterns in `.nsite-ignore` file
- Implicit dotfile ignoring (except `.well-known/`)

This helps you understand which remote files would not be re-deployed in a subsequent `nsyte deploy`
command.
