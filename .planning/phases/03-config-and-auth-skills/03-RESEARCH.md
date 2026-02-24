# Phase 3: Config and Auth Skills - Research

**Researched:** 2026-02-24
**Domain:** nsyte Agent Skills — configuration management, NIP-46 bunker auth, CI/CD non-interactive deployment
**Confidence:** HIGH (all findings verified directly from source code)

---

## Summary

Phase 3 produces three SKILL.md bodies for skills whose frontmatter scaffolds were created in Phase 1:
`nsyte-config`, `nsyte-auth`, and `nsyte-ci`. Each skill directory already exists at
`.agents/skills/nsyte-{name}/SKILL.md` with a placeholder body. The task is to write authoritative
skill bodies based on a direct audit of the nsyte CLI source code.

All three command implementations have been read in full (`src/commands/config.ts`,
`src/commands/bunker.ts`, `src/commands/ci.ts`, `src/commands/validate.ts`). The config schema has
been read from `src/schemas/config.schema.json`. The existing deploy skill (`nsyte-deploy/SKILL.md`)
has been read to establish structural patterns. The primary risk in this phase is
**cross-contamination**: `nsyte-config` covers interactive editing; `nsyte-ci` covers the
non-interactive/headless path. These must not overlap.

A critical discrepancy was found: the README documents `--nbunksec` as the deploy flag, but the
actual CLI implementation uses `--sec` (which auto-detects format including `nbunksec1...` strings).
The nsyte-deploy SKILL.md already documents the correct `--sec` flag. The CI skill must follow suit.

**Primary recommendation:** Write three focused, non-overlapping SKILL.md bodies that strictly
follow the `nsyte-deploy` skill as a structural template.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONF-01 | Agent can manage nsyte configuration and settings via `nsyte-config` skill | `nsyte config` is an interactive TUI editor; `nsyte validate` is a scriptable validator. Full command audit complete: keyboard shortcuts, field types, config schema fields all documented. |
| CONF-02 | Agent can set up non-interactive CI/CD deployment via `nsyte-ci` skill | `nsyte ci` generates an ephemeral nbunksec (never stored). The deploy non-interactive path uses `--non-interactive` + `--sec`. Audit complete. Exit codes: 0 = success, 1 = failure. |
| CONF-03 | Agent can guide NIP-46 bunker auth setup via dedicated `nsyte-auth` skill | `nsyte bunker` has 6 subcommands: connect, import, export, use, list, remove, migrate. Full audit complete including URL quoting gotcha and QR vs URL connect flows. |

</phase_requirements>

---

## Standard Stack

This phase produces documentation only — no libraries are installed. The domain knowledge required:

### Core CLI Commands for Each Skill

| Skill | Primary Command | Secondary Commands |
|-------|----------------|-------------------|
| nsyte-config | `nsyte config` (interactive TUI) | `nsyte validate` (scriptable) |
| nsyte-auth | `nsyte bunker connect/import/export/use/list/remove` | `nsyte bunker migrate` (upgrade path) |
| nsyte-ci | `nsyte ci [url]` (generates ephemeral nbunksec) | `nsyte deploy --non-interactive --sec` (uses it) |

### Config Schema Fields (from `src/schemas/config.schema.json`)

**Required fields:**
- `relays` — array of `wss://` URLs (uniqueItems)
- `servers` — array of `https://` URLs (uniqueItems)

**Optional fields:**
- `bunkerPubkey` — 64-char hex string; set by `nsyte bunker use`, not manually
- `id` — string or null; empty/null = root site (kind 15128), non-empty = named site (kind 35128)
- `title`, `description` — site metadata strings
- `fallback` — path to HTML 404 fallback file
- `gatewayHostnames` — array of hostnames, default `["nsite.lol"]`
- `publishProfile`, `publishRelayList`, `publishServerList` — booleans; root sites only
- `publishAppHandler` — boolean
- `profile` — object (name, display_name, about, picture, banner, website, nip05, lud16, lud06)
- `appHandler` — object with required `kinds` array; optional id, name, description, icon, platforms
- `$schema` — URI for editor support

**Validation rules from source (`src/lib/config-validator.ts`):**
- Root sites with `publishAppHandler: true` must also have `appHandler.id`
- `publishProfile`, `publishRelayList`, `publishServerList` are only allowed when `id` is null/empty
- `publishProfile: true` requires a non-empty `profile` object

### Secrets Storage Backends (from `src/lib/secrets/manager.ts`)

Priority order on initialization:
1. Native OS keychain (macOS Keychain, Linux Secret Service) — preferred
2. Encrypted file storage (fallback when keychain unavailable)
3. Legacy plain-text JSON (last-resort fallback, warns user)

`NSYTE_FORCE_ENCRYPTED_STORAGE=true` env var bypasses keychain and forces encrypted file storage.

---

## Architecture Patterns

### Skill Body Structure (from nsyte-deploy SKILL.md)

All skill bodies follow this pattern from the Phase 2 deploy skill:

```
## Prerequisites
[what must exist/be true before this skill applies]
---
## [Main Section 1]
[content]
---
## [Main Section N]
[content]
```

- Use `---` as section dividers (horizontal rules)
- Code blocks for all commands
- Tables for flag references
- Inline decision trees for branching workflows
- Cross-reference other skills by name (e.g., "see `nsyte-setup` skill")
- Frontmatter behavioral flags nest under `metadata:` key

### Interactive vs. Non-Interactive Separation (critical)

The primary architectural concern for Phase 3:

| Skill | Mode | Cannot contain |
|-------|------|----------------|
| `nsyte-config` | Interactive only (requires TTY) | CI/CD instructions |
| `nsyte-auth` | Interactive only (requires TTY) | CI/CD deployment patterns |
| `nsyte-ci` | Generates credential for later CI use | Interactive config editing steps |

The `nsyte config` command **checks `Deno.stdout.isTerminal()`** at startup and exits with error if
not in a TTY. This is a hard constraint to document: `nsyte config` cannot be used in CI.

The `nsyte ci` command is the **bridge**: run it interactively once (on a developer machine) to
generate the `nbunksec1...` credential, then store that credential in the CI platform's secrets
manager and pass it to `nsyte deploy --sec` in the pipeline.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config editing | Custom JSON editor | `nsyte config` (TUI) | Already implemented with validation |
| Config validation | Manual JSON parsing | `nsyte validate` | Has AJV schema, custom rules, suggestions |
| Bunker credential generation | Custom NIP-46 flow | `nsyte ci [url]` | Handles ephemeral-only nbunksec safely |
| Bunker storage | Custom keychain access | `nsyte bunker import/use` | Manages multi-backend secrets safely |

---

## Common Pitfalls

### Pitfall 1: README Flag Discrepancy

**What goes wrong:** The README (as of 2026-02-24) documents `--nbunksec` as the deploy flag (e.g.,
`nsyte deploy ./dist --nbunksec ${NBUNK_SECRET}`). This flag does **not exist** in the source.

**Why it happens:** README was not updated when the CLI was refactored to use `--sec` (which
auto-detects the credential format including `nbunksec1...` strings).

**How to avoid:** The `nsyte-ci` skill must use `--sec` (not `--nbunksec`) in all CI examples.
Verified in `src/commands/deploy.ts` line 120: `"--sec <secret:string>"`.

**Confidence:** HIGH — verified directly from source.

### Pitfall 2: Shell Metacharacter Quoting for Bunker URLs

**What goes wrong:** `nsyte bunker connect bunker://pubkey?relay=wss://relay.example&secret=xxx`
loses the `?` and `&` to shell interpretation, resulting in an incomplete URL that the CLI detects
as malformed.

**Why it happens:** `?` and `&` are shell metacharacters. Shells strip or reinterpret them.

**How to avoid:** Always single-quote the bunker URL:
```bash
nsyte bunker connect 'bunker://pubkey?relay=wss://relay.example&secret=xxx'
```
This is documented in the source at `src/commands/bunker.ts` lines 447-473 (the CLI detects the
issue and prompts to retry interactively).

**Confidence:** HIGH — verified in source code.

### Pitfall 3: nsyte config Requires TTY

**What goes wrong:** Running `nsyte config` in a script or pipe fails with "Config editor requires
an interactive terminal".

**Why it happens:** The command checks `Deno.stdout.isTerminal()` at startup and throws if false
(`src/commands/config.ts` line 578).

**How to avoid:** `nsyte config` is strictly for interactive use. For scripted config inspection,
use `cat .nsite/config.json` or `nsyte validate`. For scripted edits, modify the JSON file directly
and run `nsyte validate` to verify.

**Confidence:** HIGH — verified in source.

### Pitfall 4: bunkerPubkey is Hex, Not npub

**What goes wrong:** An agent reads `bunkerPubkey` from `config.json` and treats it as an npub
(`npub1...`) address. The config field stores the raw 64-char hex pubkey, not bech32.

**Why it happens:** `nsyte bunker use` writes `config.bunkerPubkey = pubkey` where `pubkey` is the
hex value. The `nsyte config` TUI displays the hex and also shows the npub via `npubEncode()` for
human-friendly display.

**How to avoid:** Document that `bunkerPubkey` in `config.json` is always 64 hex chars. The schema
enforces this with `"pattern": "^[0-9a-fA-F]{64}$"`.

**Confidence:** HIGH — verified from schema and bunker source.

### Pitfall 5: nsyte ci Does NOT Store the Credential

**What goes wrong:** User runs `nsyte ci`, sees the `nbunksec1...` string, but doesn't copy it.
It cannot be recovered — it was intentionally not stored to disk.

**Why it happens:** `nsyte ci` calls `connectBunker(url, true, true)` with `noPersist=true` and
`skipProjectInteraction=true`. The nbunksec is generated in memory and printed once.

**How to avoid:** The skill must warn users to **copy the nbunksec immediately** when displayed.
Recommend storing it in the CI platform's secrets manager (e.g., GitHub Actions secret, HashiCorp
Vault) before closing the terminal.

**Confidence:** HIGH — verified in `src/commands/ci.ts`.

### Pitfall 6: Stored Bunker Requires Both config.json AND OS Keychain Entry

**What goes wrong:** Agent sets `bunkerPubkey` in `config.json` (e.g., via `nsyte config`) but
there is no corresponding nbunksec in the OS keychain. nsyte fails at deploy time.

**Why it happens:** Two separate stores: `config.json` holds the pubkey reference; the OS keychain
holds the actual credential. Both must exist. Setting `bunkerPubkey` manually in the config without
running `nsyte bunker use` (which stores the credential) creates a dangling reference.

**How to avoid:** Always set `bunkerPubkey` via `nsyte bunker use <pubkey>`, not by hand-editing
the config. This command writes both the config and the keychain entry atomically.

**Confidence:** HIGH — verified from `src/commands/bunker.ts` `useBunkerForProject()` function.

---

## Code Examples

Verified patterns from source code:

### nsyte config — Interactive TUI Keyboard Reference

Source: `src/commands/config.ts` lines 347-363

```
Navigation:   ↑/↓       Move between fields
Edit:         ENTER     Start editing / expand array or object
Save:         s         Save all changes to .nsite/config.json
Reset:        r         Discard unsaved changes (revert to loaded values)
Help:         h         Toggle help line
Quit:         q         Quit (prompts to save if unsaved changes exist)
Expand/Collapse: ESC    Collapse all expanded sections (or quit if none expanded)
Delete item:  DEL/BACKSPACE  Delete array item or object property (with confirm)
```

Special field: `bunkerPubkey` opens a bunker-selection overlay showing stored bunkers from the OS
keychain. Choose from the list or enter an npub manually.

### nsyte validate — Scriptable Config Check

Source: `src/commands/validate.ts`

```bash
# Basic validation (exits 0 = valid, 1 = invalid)
nsyte validate

# Validate a specific config file
nsyte validate --file /path/to/.nsite/config.json

# Show JSON Schema location for editor integration
nsyte validate --schema

# Alias
nsyte val
```

Output on success:
```
✓ Configuration is valid!

Configuration Summary:
  Relays: 2
  Servers: 1
  Title: My Site
```

Output on failure prints error list and exits 1. Useful in CI pre-flight checks.

### nsyte bunker — Subcommand Reference

Source: `src/commands/bunker.ts`

```bash
# Connect to a bunker (QR code or URL — interactive)
nsyte bunker connect
nsyte bunker connect 'bunker://pubkey?relay=wss://relay.nsec.app&secret=xxx'

# Import an existing nbunksec string
nsyte bunker import nbunksec1...

# Export a stored bunker as nbunksec (for backup or CI setup)
nsyte bunker export [pubkey]

# List all stored bunkers
nsyte bunker list

# Configure current project to use a specific bunker
nsyte bunker use [pubkey]

# Remove a bunker from storage
nsyte bunker remove [pubkey]

# Rebuild index for existing keychain bunkers (upgrade/repair)
nsyte bunker migrate [pubkey1] [pubkey2] ...
```

### NIP-46 Connect Flow — Two Methods

Source: `src/commands/bunker.ts` `connectBunker()` function

**Method 1: QR Code (Nostr Connect)**
1. Run `nsyte bunker connect` with no URL
2. Choose "Scan QR Code (Nostr Connect)"
3. Enter relay (default: `wss://relay.nsec.app`)
4. A QR code is displayed in terminal
5. Scan with your signer app (Amber, nsec.app, etc.)
6. Approve the connection request in the signer app
7. nsyte stores the nbunksec in the OS keychain

**Method 2: Bunker URL**
1. Get the `bunker://...` URL from your signer app
2. Run: `nsyte bunker connect 'bunker://pubkey?relay=wss://...&secret=...'`
   (MUST use single quotes around the URL — shell metacharacters)
3. nsyte stores the nbunksec

After connection, link the bunker to the project:
```bash
nsyte bunker use [pubkey]    # sets bunkerPubkey in .nsite/config.json
```

### nsyte ci — Generate Ephemeral Credential

Source: `src/commands/ci.ts`

```bash
# Interactive: prompts for connection method (QR or URL)
nsyte ci

# Non-interactive: provide URL directly (single-quote required)
nsyte ci 'bunker://pubkey?relay=wss://relay.nsec.app&secret=xxx'
```

This command:
- Connects to the bunker
- Generates the `nbunksec1...` string
- **Prints it once** — copy immediately, it is never stored to disk
- Prints CI usage hint: `nsyte deploy ./dist --sec ${NBUNK_SECRET}`

### CI/CD Deploy Pattern

Verified against `src/commands/deploy.ts`:

```bash
# Correct flag: --sec (not --nbunksec as README shows)
nsyte deploy ./dist \
  --non-interactive \
  --sec "${NBUNK_SECRET}"
```

GitHub Actions example (corrected from README):

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: nsyte deploy ./dist --non-interactive --sec "${{ secrets.NBUNK_SECRET }}"
```

Exit codes:
- `0` = deploy succeeded (all files uploaded)
- `1` = deploy failed (auth failure, config missing, upload errors)

Partial upload (some servers failed) still exits `0` if at least some files uploaded successfully
— verify the output "N/M files uploaded" line to detect partial success.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `--nbunksec` deploy flag | `--sec` (auto-detects all credential formats) | Before 2026-02-24 | README is stale; use `--sec` |
| Legacy plain JSON secrets file | OS keychain + encrypted file fallback | Before 2026-02-24 | `nsyte bunker migrate` repairs index for old installs |
| Single `upload` command | `deploy` command (`upload` is deprecated alias) | Before 2026-02-24 | Use `deploy` in new docs |

**Deprecated/outdated:**
- `upload` alias: still works but prints deprecation warning; all docs should say `deploy`
- `--nbunksec` flag: documented in README but does not exist in source; use `--sec`

---

## Open Questions

1. **Partial success exit code**
   - What we know: deploy exits 0 when `uploadedFiles === successfulFiles` and 1 when
     `successfulFiles === 0` (source inspection)
   - What's unclear: the exact condition when some (but not all) files upload — whether this is
     exit 0 or 1 (source shows `Deno.exit(0)` on the final upload line but the logic is complex)
   - Recommendation: Document as "exit 0 even on partial success; check the '`N/M files uploaded`'
     line for true success count" — this is the safest description without running the binary

2. **Secrets storage path on Linux/Windows**
   - What we know: macOS uses Keychain; code uses `getKeychainProvider()` which selects backend
   - What's unclear: exact fallback paths on Linux/Windows when no keychain is available
   - Recommendation: For nsyte-auth skill, note that secret storage is handled automatically
     and users can force encrypted file storage with `NSYTE_FORCE_ENCRYPTED_STORAGE=true`

---

## Sources

### Primary (HIGH confidence)

All findings verified directly from source code in the nsyte repository:

- `src/commands/config.ts` — full read; interactive TUI editor implementation
- `src/commands/bunker.ts` — full read; NIP-46 bunker management subcommands
- `src/commands/ci.ts` — full read; ephemeral nbunksec generator
- `src/commands/validate.ts` — full read; config validation command
- `src/commands/deploy.ts` lines 115-168 — flag definitions including `--sec` and `--non-interactive`
- `src/schemas/config.schema.json` — full read; authoritative config field reference
- `src/lib/config-validator.ts` — full read; validation rules including cross-field constraints
- `src/lib/secrets/manager.ts` — full read; secrets storage backend selection logic
- `src/lib/nip46.ts` lines 1-36 — signing permissions list
- `.agents/skills/nsyte-deploy/SKILL.md` — structural template for skill body format
- `.agents/skills/nsyte-setup/SKILL.md` — additional structural pattern reference
- `README.md` lines 321-356 — CI/CD section (used to identify `--nbunksec` discrepancy)

### Tertiary (LOW confidence — not needed, noted for awareness)

- README.md CI section shows `--nbunksec` flag — **known incorrect**, source uses `--sec`

---

## Metadata

**Confidence breakdown:**
- Config field documentation: HIGH — read directly from JSON schema
- Command flags and behavior: HIGH — read directly from command source
- Interactive TUI keyboard map: HIGH — read directly from render function and key handlers
- Secrets storage backend selection: HIGH — read manager.ts initialization logic
- Exit codes: MEDIUM — identified Deno.exit() call sites but did not trace all code paths
- CI/GitHub Actions examples: HIGH for flag names; MEDIUM for overall pipeline structure

**Research date:** 2026-02-24
**Valid until:** 2026-05-24 (stable CLI; recheck if nsyte releases major version)
