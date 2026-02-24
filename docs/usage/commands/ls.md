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
nsyte ls [path] [options]
```

## Arguments

- `[path]` — Optional path filter. Can be a directory (e.g., `docs/`) or specific file (e.g., `docs/index.html`)

## Options

- `-r, --relays <relays>` — The nostr relays to use (comma-separated). If not specified, uses relays from project config or default discovery relays
- `--sec <secret>` — Secret for signing (auto-detects: nsec, nbunksec, bunker://, hex)
- `-p, --pubkey <npub>` — The public key to list files for (npub, hex, or NIP-05)
- `-d, --name <name>` — Site identifier for named sites. If not provided, lists root site
- `--use-fallback-relays` — Include default nsyte relays in addition to configured relays
- `--use-fallbacks` — Enable all fallback options (relays)

## Examples

List files using project config:

```bash
nsyte ls
```

List files for a specific public key:

```bash
nsyte ls --pubkey npub1... --relays wss://relay.example
```

List files in a specific directory:

```bash
nsyte ls docs/
```

List a specific file:

```bash
nsyte ls docs/index.html
```

List files from a named site:

```bash
nsyte ls -d blog
```

Use fallback relays for better discovery:

```bash
nsyte ls --use-fallbacks
```

## Authentication

The `ls` command supports multiple authentication methods:

1. **Explicit pubkey** - Use `--pubkey` to list files for any public key (no signing required)
2. **Unified secret** - Use `--sec` with any supported format (nsec, nbunksec, bunker://, hex)
3. **Project bunker** - Uses the bunker configured in `.nsite/config.json`
4. **Interactive mode** - If no key is provided, you'll be prompted to select an authentication method

## Ignore Rules

Files marked in red in the output would be ignored during upload based on:

- Default ignore patterns (`.git/**`, `node_modules/**`, etc.)
- Custom patterns in `.nsyte-ignore` file
- Implicit dotfile ignoring (except `.well-known/`)

This helps you understand which remote files would not be re-deployed in a subsequent `nsyte deploy`
command.
