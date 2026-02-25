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
- `migrate [...pubkeys]` — Rebuild index for keychain bunkers (macOS/Windows)
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

Connect without storing (ephemeral):

```bash
nsyte bunker connect --no-persist
```

Connect with forced encrypted storage:

```bash
nsyte bunker connect --force-encrypted-storage
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

Rebuild bunker index (macOS/Windows):

```bash
nsyte bunker migrate
```

Migrate specific bunkers:

```bash
nsyte bunker migrate <pubkey1> <pubkey2>
```

## Bunker Migration

The `migrate` subcommand is used to rebuild the bunker index on platforms that use native keychains (macOS and Windows).

### When to Use

- After manually adding bunkers to the keychain
- If `bunker list` is not showing all bunkers
- After upgrading from an older version of nsyte
- When experiencing keychain access issues

### How it Works

1. **Auto-discovery**: Scans the system keychain for stored bunkers
2. **Index rebuild**: Creates or updates the encrypted index
3. **Verification**: Validates each discovered bunker
4. **Summary**: Shows count of migrated bunkers

### Manual Migration

If auto-discovery fails, you can manually specify pubkeys:

```bash
nsyte bunker migrate abc123... def456...
```

The migration creates a completion marker to prevent re-running unnecessarily.

## Connect Options

The `connect` subcommand supports these options:

- `--pubkey <pubkey>` — Bunker public key (alternative to full URL)
- `--relay <relay>` — Relay URL (alternative to full URL)
- `--secret <secret>` — Connection secret (alternative to full URL)
- `--persist` — Store nbunksec for future use (default: true)
- `--no-persist` — Don't store nbunksec (ephemeral connection for CI/CD)
- `--force-encrypted-storage` — Force encrypted file storage instead of OS keychain

### Connection Methods

**Interactive QR Scan**: Displays QR code for scanning with bunker app

**Manual URL**: Paste bunker URL from your bunker provider

**Component-based**: Provide `--pubkey`, `--relay`, and optionally `--secret` separately

## See Also

- [`nsyte ci`](ci.md) - Create ephemeral bunker credentials for CI/CD
- [Security Guide](../guides/security.md) - Bunker security best practices
