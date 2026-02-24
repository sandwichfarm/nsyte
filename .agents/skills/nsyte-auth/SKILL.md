---
name: nsyte-auth
description: Sets up NIP-46 bunker authentication for nsyte, enabling remote signing without exposing a private key. Use when the user wants to configure bunker auth, connect a remote signer, or set up non-interactive key management for nsyte.
---

## Prerequisites

- nsyte installed and in PATH (see `nsyte-setup` skill if not installed)
- `.nsite/config.json` must exist — run `nsyte init` first (see `nsyte-config` skill)
- An interactive terminal is required for all `nsyte bunker` commands — no pipe/CI support
- For NIP-46 and bunker domain vocabulary, see the `nsyte-concepts` skill

---

## Connecting a Bunker

Two methods are available. Use whichever your signer app supports.

### Method 1: QR Code (Nostr Connect)

```bash
nsyte bunker connect
```

1. Run the command with no URL
2. Choose **"Scan QR Code (Nostr Connect)"** from the prompt
3. Enter a relay URL (default: `wss://relay.nsec.app`)
4. A QR code is displayed in the terminal
5. Scan the QR code with your signer app (Amber, nsec.app, etc.)
6. Approve the connection request in the signer app
7. nsyte automatically stores the nbunksec in your OS keychain

### Method 2: Bunker URL

```bash
nsyte bunker connect 'bunker://pubkey?relay=wss://relay.nsec.app&secret=xxx'
```

1. Get the `bunker://...` URL from your signer app
2. Run the command above — **MUST use single quotes** around the URL
3. nsyte stores the nbunksec in your OS keychain

**CRITICAL:** Always single-quote the bunker URL. The `?` and `&` characters in the URL
are shell metacharacters. Without quotes, the shell strips or reinterprets them and the
URL arrives at nsyte malformed.

---

## Link Bunker to Project

After connecting, assign the bunker to your project:

```bash
nsyte bunker use [pubkey]
```

This command:
- Sets `bunkerPubkey` in `.nsite/config.json` to the 64-char hex pubkey
- Stores the matching nbunksec in the OS keychain

**NEVER manually edit `bunkerPubkey` in config.json.** Hand-editing the config field creates
a dangling reference — the keychain entry will be missing and nsyte will fail at deploy time.
Always use `nsyte bunker use` to set this field.

Note: `bunkerPubkey` is stored as 64-char hex (not npub). The schema enforces
`^[0-9a-fA-F]{64}$` — nsyte rejects any other format.

---

## Bunker Management Subcommands

| Command | Purpose |
|---------|---------|
| `nsyte bunker connect` | Connect to a new bunker interactively (QR or URL prompt) |
| `nsyte bunker connect '<url>'` | Connect via bunker URL (single-quote required) |
| `nsyte bunker import nbunksec1...` | Import an existing nbunksec string into storage |
| `nsyte bunker export [pubkey]` | Export a stored bunker as nbunksec (for backup) |
| `nsyte bunker list` | List all bunkers stored in the OS keychain |
| `nsyte bunker use [pubkey]` | Set the current project to use a specific bunker |
| `nsyte bunker remove [pubkey]` | Remove a bunker from storage |
| `nsyte bunker migrate [pubkeys...]` | Rebuild keychain index (for upgrades or repairs) |

---

## Secrets Storage

nsyte stores nbunksec credentials using an OS-appropriate backend, selected automatically:

1. **macOS:** Keychain (preferred)
2. **Linux:** Secret Service (preferred); encrypted file fallback if unavailable
3. **Windows:** Credential Manager (preferred); encrypted file fallback if unavailable
4. **Last resort:** Legacy plain-text JSON file — nsyte prints a warning when this is used

To force encrypted file storage (bypass OS keychain):

```bash
NSYTE_FORCE_ENCRYPTED_STORAGE=true nsyte bunker connect
```

---

## Troubleshooting

**"No stored credential" error at deploy time**

Both parts must exist: `bunkerPubkey` in `config.json` AND the nbunksec in the OS keychain.
Re-run `nsyte bunker use [pubkey]` to write both atomically.

**Bunker URL loses characters or is rejected as malformed**

Shell metacharacters (`?`, `&`) were not quoted. Re-run with single quotes:
```bash
nsyte bunker connect 'bunker://pubkey?relay=wss://...&secret=...'
```

**`bunkerPubkey` validation error**

The field must be exactly 64 hex characters. Do not use npub format. The `nsyte config` TUI
displays both formats for readability, but only the hex value is stored.
