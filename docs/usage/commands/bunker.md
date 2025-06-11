---
title: bunker
description: Manage nostr bunker connections and nbunks
---

# bunker

Manage nostr bunker connections and nbunks (NIP-46 remote signing).

## Usage

```bash
nsyte bunker <subcommand> [options]
```

## Subcommands

- `connect [url]` — Connect to a bunker URL and store as nbunksec
- `list` — List all stored bunkers in the system
- `import [nbunksec]` — Import a bunker from an nbunksec string
- `export [pubkey]` — Export a bunker as an nbunksec string
- `use [pubkey]` — Configure current project to use a bunker
- `remove [pubkey]` — Remove a bunker from storage
- `help` — Show detailed help information

## Examples

Connect to a bunker interactively:

```bash
nsyte bunker connect
```

Connect to a bunker with a URL:

```bash
nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'
```

List all bunkers:

```bash
nsyte bunker list
```

Import a bunker from an nbunksec string:

```bash
nsyte bunker import <nbunksec>
```

Export a bunker as an nbunksec string:

```bash
nsyte bunker export <pubkey>
```

Use a bunker for the current project:

```bash
nsyte bunker use <pubkey>
```

Remove a bunker from storage:

```bash
nsyte bunker remove <pubkey>
```
