---
name: nsyte
description: Deploy and manage censorship-resistant static websites (nsites) on the Nostr network with the nsyte CLI. Covers installation, project setup, .nsite/config.json, authentication (NIP-46 bunkers, nsec, nbunksec), deploying to Blossom servers, inspecting and updating published sites, dry-run previews, secrets scanning, deleting/undeploying, CI/CD automation, and troubleshooting. Use when the user mentions nsyte, nsite, Nostr site hosting, Blossom uploads, or decentralized web publishing.
license: MIT
metadata:
  author: sandwichfarm
  repository: https://github.com/sandwichfarm/nsyte
  homepage: https://nsyte.run
  docs: https://nsyte.run/docs/
---

# nsyte — Decentralized Static Site Deployment

nsyte is a Deno-based CLI that publishes static websites to the Nostr network. Files are uploaded to
Blossom servers (content-addressed by SHA-256) and a signed manifest event is published to Nostr
relays. Sites are censorship-resistant and served by any nsite gateway.

**Domain knowledge:** For Nostr/Blossom concepts (relays, pubkeys, nsec, NIP-46, events, kinds), see
[references/nostr-concepts.md](references/nostr-concepts.md).

**Config schema:** [assets/config.schema.json](assets/config.schema.json) is the JSON Schema for
`.nsite/config.json` (also served at `https://nsyte.run/schemas/config.schema.json`).

---

## Agent Quick Reference

| User wants to…                         | Run                                                           |
| -------------------------------------- | ------------------------------------------------------------- |
| Check nsyte is installed               | `nsyte --version`                                             |
| Set up a new project                   | `nsyte init` (interactive) or write `.nsite/config.json`      |
| Validate config                        | `nsyte validate`                                              |
| Preview a deploy without publishing    | `nsyte deploy ./dist --dry-run`                               |
| Deploy a built site                    | `nsyte deploy ./dist`                                         |
| Deploy in CI                           | `nsyte deploy ./dist --non-interactive --sec "$NBUNK_SECRET"` |
| Check for leaked secrets before deploy | `nsyte scan ./dist`                                           |
| See what is published                  | `nsyte list` (file tree) / `nsyte status` (propagation)       |
| Fetch one published file               | `nsyte get /index.html`                                       |
| Replace one published file             | `nsyte put ./dist/index.html /index.html`                     |
| List all sites for a pubkey            | `nsyte sites`                                                 |
| Preview locally                        | `nsyte serve -d ./dist` / `nsyte run`                         |
| Diagnose a broken site                 | `nsyte debug [npub]`                                          |
| Remove a site                          | `nsyte delete` (manifest) / `nsyte undeploy` (everything)     |

### Rules for agents

1. **Never print, log, or commit secrets** (`nsec1…`, `nbunksec1…`, `bunker://…` URLs, 64-char hex
   keys). Pass them via environment variables (`--sec "$VAR"`) or `--prompt-sec`.
2. **Never hand-edit `bunkerPubkey`** in `.nsite/config.json`. It must be set by `nsyte bunker use`
   so the matching credential exists in the secrets backend.
3. **Single-quote `bunker://` URLs** on the shell — `?` and `&` are shell metacharacters.
4. **Prefer `--dry-run` first** for `deploy`, `put`, `announce`, `snapshot`, `delete`, and
   `undeploy`. It writes the events that would be signed to a directory without publishing anything.
5. **`delete` and `undeploy` are irreversible.** Confirm with the user before running them, and
   never pass `--yes` unless the user explicitly asked for a non-interactive deletion.
6. **Use `--non-interactive` in CI and scripts.** Without a TTY, interactive prompts will hang or
   fail.
7. **Read `.nsite/config.json` before suggesting relays/servers.** Do not invent URLs; if the config
   is empty, propose the public defaults listed under [Defaults](#defaults).

---

## Installation

### Check if installed

```bash
nsyte --version
```

If this prints a version string, skip to [Project Setup](#project-setup).

### Linux / macOS (recommended — no Deno required)

```bash
curl -fsSL https://nsyte.run/get/install.sh | bash
```

Installs a pre-built binary to `/usr/local/bin/nsyte`. Use `sudo` if that directory is not writable.

### Package managers

```bash
# Homebrew (macOS / Linux)
brew tap sandwichfarm/nsyte https://github.com/sandwichfarm/homebrew-nsyte
brew install nsyte

# Scoop (Windows)
scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte
scoop install nsyte

# AUR (Arch Linux)
yay -S nsyte-bin
```

### Deno (any platform, requires Deno 2.x)

```bash
deno install -A -f -g -n nsyte jsr:@nsyte/cli
```

### Pre-built binaries

Download from `https://github.com/sandwichfarm/nsyte/releases` and place on `PATH`.

### Troubleshooting installation

- **Command not found:** add `/usr/local/bin` (or `~/.deno/bin` for Deno installs) to `PATH`.
- **Permission denied:** rerun the curl install with `sudo`, or install to a user-writable dir.
- **Deno version too old:** run `deno upgrade` or use the binary install instead.

---

## Project Setup

### Interactive (requires a TTY)

```bash
cd /path/to/your/project
nsyte init
```

Prompts for: auth method (generate key / existing nsec / NIP-46 bunker), relay URLs (`wss://`), and
Blossom server URLs (`https://`). Writes `.nsite/config.json`.

Only bunker connections are persisted (`bunkerPubkey` in the config + credential in the secrets
backend). A generated or pasted private key is **not stored anywhere** — the user must keep it and
pass it with `--sec` (or `--prompt-sec`) on every signing command, or switch to a bunker.

### Non-interactive (agents, scripts, CI)

`nsyte init` has no flags. When there is no TTY, create the config directly, then validate it:

```bash
mkdir -p .nsite
cat > .nsite/config.json <<'EOF'
{
  "$schema": "https://nsyte.run/schemas/config.schema.json",
  "relays": ["wss://relay.damus.io", "wss://nos.lol"],
  "servers": ["https://blossom.primal.net", "https://cdn.hzrd149.com"]
}
EOF
nsyte validate
```

Then supply signing credentials per command with `--sec` (see [Authentication](#authentication)), or
link a bunker with `nsyte bunker use`.

`.nsite/config.json` never contains private keys — at most `bunkerPubkey`, a public reference — so
it is safe to commit. Deploys exclude it by default (see [Ignoring files](#ignoring-files)).

---

## Configuration

Config file: `.nsite/config.json` (override with the global `-c, --config <path>` flag).

### Required fields

| Field     | Type       | Description                                    |
| --------- | ---------- | ---------------------------------------------- |
| `relays`  | `string[]` | Nostr relay URLs (`wss://`), unique items      |
| `servers` | `string[]` | Blossom server URLs (`https://`), unique items |

### Authentication

| Field          | Type     | Description                                                                                                                                |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `bunkerPubkey` | `string` | 64-char hex pubkey of a NIP-46 bunker. **Set via `nsyte bunker use`, never by hand.** The secret lives in the secrets backend (see below). |

### Site identity

| Field         | Type             | Default | Description                                                                                              |
| ------------- | ---------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `id`          | `string \| null` | `null`  | `null`/empty = root site (kind 15128). Non-empty = named site (kind 35128). Must match `[a-z0-9-]{1,13}` |
| `title`       | `string`         | —       | Site title recorded on the manifest event                                                                |
| `description` | `string`         | —       | Site description recorded on the manifest event                                                          |
| `source`      | `string`         | —       | Repository URL (`http(s)://`) recorded as the `source` tag on the manifest                               |
| `fallback`    | `string`         | —       | 404 fallback HTML path (e.g. `/index.html` for SPAs)                                                     |

### Publishing flags (root sites only — `id` must be null/empty)

| Field               | Type      | Description                                                                                  |
| ------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `publishProfile`    | `boolean` | Publish kind 0 profile metadata. Requires non-empty `profile` object                         |
| `publishRelayList`  | `boolean` | Publish kind 10002 relay list (NIP-65)                                                       |
| `publishServerList` | `boolean` | Publish kind 10063 Blossom server list                                                       |
| `publishAppHandler` | `boolean` | Publish NIP-89 handler (kind 31990). Requires `appHandler.kinds`. Allowed on named sites too |

### Optional objects

| Field              | Type       | Description                                                                                               |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| `profile`          | `object`   | Nostr profile: `name`, `display_name`, `about`, `picture`, `banner`, `website`, `nip05`, `lud16`, `lud06` |
| `appHandler`       | `object`   | NIP-89 config: `kinds` (required), `id`, `name`, `description`, `icon`, `platforms`                       |
| `gatewayHostnames` | `string[]` | Gateway hostnames printed after deploy (default: `["nsite.lol"]`)                                         |

### Example configs

**Minimal (root site):**

```json
{
  "$schema": "https://nsyte.run/schemas/config.schema.json",
  "relays": ["wss://relay.damus.io", "wss://nos.lol"],
  "servers": ["https://blossom.primal.net"]
}
```

**Named site (blog):**

```json
{
  "relays": ["wss://relay.damus.io"],
  "servers": ["https://blossom.primal.net"],
  "id": "blog",
  "title": "My Blog",
  "description": "A blog about decentralized applications",
  "source": "https://github.com/me/my-blog"
}
```

**SPA with profile publishing (root site):**

```json
{
  "relays": ["wss://relay.damus.io", "wss://nos.lol"],
  "servers": ["https://blossom.primal.net"],
  "fallback": "/index.html",
  "publishProfile": true,
  "publishRelayList": true,
  "publishServerList": true,
  "profile": {
    "name": "Alice",
    "about": "Decentralization enthusiast",
    "picture": "https://example.com/avatar.jpg",
    "nip05": "alice@example.com"
  }
}
```

**With NIP-89 app handler:**

```json
{
  "relays": ["wss://relay.damus.io"],
  "servers": ["https://blossom.primal.net"],
  "publishAppHandler": true,
  "appHandler": {
    "kinds": [1, 30023],
    "name": "My Nostr Viewer",
    "description": "A viewer for notes and articles",
    "platforms": {
      "web": {
        "patterns": [{ "url": "https://myapp.example/e/<bech32>", "entities": ["nevent", "note"] }]
      }
    }
  }
}
```

### Editing and validating

```bash
nsyte config      # interactive TUI editor (requires a TTY): ↑/↓ move, Enter edit, s save, q quit
nsyte validate    # exit 0 = valid, exit 1 = invalid; prints each schema violation
nsyte validate -f path/to/config.json
nsyte validate --schema   # print the schema location
```

In non-interactive contexts, edit the JSON directly and run `nsyte validate`.

### Ignoring files

Create `.nsyte-ignore` in the directory you run `nsyte` from (gitignore-style globs, `#` comments).
Always ignored: `.git/**`, `.DS_Store`, `node_modules/**`, `.nsyte-ignore`, `.nsite/config.json`,
`.vscode/**`.

### Defaults

When the user has no preference, these public services are reasonable starting points:

- Relays: `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nsite.lol`
- Blossom servers: `https://blossom.primal.net`, `https://cdn.hzrd149.com`

`--use-fallback-relays`, `--use-fallback-servers`, and `--use-fallbacks` add nsyte's built-in
defaults to whatever is configured.

---

## Authentication

Every command that signs events accepts:

- `--sec <secret>` — auto-detects `nsec1…`, `nbunksec1…`, `bunker://…`, or 64-char hex.
- `--prompt-sec` — prompt for the secret at runtime (keeps it out of shell history / logs).

### Resolution order

1. `--sec` / `--prompt-sec` (highest priority)
2. Stored bunker: `bunkerPubkey` in `.nsite/config.json` + credential in the secrets backend
3. Otherwise nsyte errors (`--non-interactive`) or prompts (interactive)

### NIP-46 bunker (recommended for humans)

```bash
nsyte bunker connect                                           # interactive: QR code or paste URL
nsyte bunker connect 'bunker://<pubkey>?relay=wss://relay.example.com&secret=xxx'
nsyte bunker connect --pubkey <pubkey> --relay <relay> --secret <secret>
nsyte bunker use [pubkey]                                      # link this project to a stored bunker
```

`connect` and `import` store the credential (`nbunksec`) in the secrets backend; `use` only looks up
an already-stored bunker by pubkey and writes its `bunkerPubkey` into the project config.

| Command                             | Purpose                                    |
| ----------------------------------- | ------------------------------------------ |
| `nsyte bunker connect [url]`        | Connect and store a bunker (QR or URL)     |
| `nsyte bunker import [nbunksec]`    | Import an existing `nbunksec1…` credential |
| `nsyte bunker export [pubkey]`      | Export a stored bunker as `nbunksec1…`     |
| `nsyte bunker list`                 | List stored bunkers                        |
| `nsyte bunker use [pubkey]`         | Point the current project at a bunker      |
| `nsyte bunker remove [pubkey]`      | Delete a bunker from storage               |
| `nsyte bunker migrate [pubkeys...]` | Rebuild the keychain index (macOS)         |

### Secrets storage

Bunker credentials go to a platform-selected backend, best available first:

1. Native keychain — macOS Keychain, Linux Secret Service (`secret-tool`), Windows Credential
   Manager
2. AES-256-GCM encrypted file (`~/.config/nsyte/secrets.enc` on Linux) when no keychain is usable
3. **Plain-text JSON fallback** if the encrypted store cannot be initialized — nsyte logs a warning;
   treat this as unprotected and tell the user

Force the encrypted file with `NSYTE_FORCE_ENCRYPTED_STORAGE=true`; skip the keychain with
`NSYTE_DISABLE_KEYCHAIN=true`.

---

## Deployment

### Basic deploy

```bash
nsyte deploy ./dist
```

Aliases: `nsyte upload` (deprecated), `nsyte dpl`.

What happens: scan directory → diff against the published manifest by SHA-256 → upload only
new/changed blobs to every configured Blossom server → publish the manifest event (kind 15128 root /
35128 named) to relays → optionally publish metadata events → print gateway URLs.

### Preview first (dry run)

```bash
nsyte deploy ./dist --dry-run
nsyte deploy ./dist --dry-run --dry-run-show-kinds 15128,31990   # also print those events
nsyte deploy ./dist --dry-run --dry-run-output ./preview         # default: /tmp/nsyte-dry-run-<ts>/
```

Nothing is uploaded or published. The output directory contains one JSON file per event that would
have been signed — inspect it before the real deploy.

### Secrets scan

`deploy` runs a secrets scan (API keys, tokens, private keys) before uploading and aborts on
findings. Run it standalone or tune it:

```bash
nsyte scan ./dist                        # exit 1 if findings, 0 if clean
nsyte scan ./dist --scan-level high -q   # low | medium (default) | high
nsyte deploy ./dist --scan-level low
nsyte deploy ./dist --skip-secrets-scan  # only if the user confirms the findings are false positives
```

### Common flags

| Flag                                                                   | Purpose                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `--sec <secret>`                                                       | Signing credential (see Authentication)                      |
| `-i, --non-interactive`                                                | No prompts; fail fast. Use in CI and agent runs              |
| `-d, --name <id>`                                                      | Deploy a named site (kind 35128) instead of the root site    |
| `-f, --force`                                                          | Re-upload every file, skipping server preflight checks       |
| `--sync`                                                               | Check all servers and upload any missing blobs               |
| `--fallback <file>`                                                    | SPA fallback: map 404 to this HTML file (e.g. `/index.html`) |
| `-c, --concurrency <n>`                                                | Parallel uploads (default 4)                                 |
| `-r, --relays` / `-s, --servers`                                       | Comma-separated overrides for this run                       |
| `--no-config`                                                          | Ignore `.nsite/config.json`; use only CLI flags              |
| `--use-fallbacks`                                                      | Add built-in default relays and servers                      |
| `--publish-profile` / `--publish-relay-list` / `--publish-server-list` | Root sites only                                              |
| `--publish-app-handler --handler-kinds 1,30023`                        | NIP-89 announcement (kind 31990)                             |
| `-v, --verbose`                                                        | Detailed per-file / per-server output                        |

Global flags (every command): `-c, --config <path>` and `--created-at <epoch|ISO-8601>` (override
the `created_at` on published events, useful for reproducible deploys).

### Interpreting output and exit codes

- `N files uploaded successfully (size)` — every file reached every server.
- `N/M files uploaded successfully` — partial; manifest still published, site may be partially
  available. Exit code **0**.
- `Failed to upload any files` or manifest published to zero relays — exit code **1**.
- Gateway URLs are printed after success: root sites `https://<npub>.nsite.lol/`, named sites
  `https://<base36-pubkey><id>.nsite.lol/`. Also printed: `nsyte run <npub|naddr>` to preview
  locally.

When stdin is not a TTY the live progress UI is disabled; pass `--non-interactive` (or set
`NSITE_DISPLAY_MODE=non-interactive`) for plain line-based output in scripts. Set `LOG_LEVEL=debug`
for verbose diagnostics.

---

## Inspecting and Updating Published Sites

```bash
nsyte list [path]              # current manifest file tree (alias: ls); filter to a subtree
nsyte status [path]            # relay coverage, manifest history, per-server availability bars
nsyte status --full            # per-file availability across servers
nsyte sites                    # all root + named sites for the pubkey
nsyte get /index.html          # print one published file to stdout
nsyte get assets/logo.svg -o ./logo.svg
nsyte put ./dist/about.html /about.html   # upload one file and republish the manifest
nsyte put ./logo.svg assets/              # directory-style path → basename appended
nsyte download -o ./backup     # download the whole site
nsyte snapshot                 # publish an immutable kind 5128 snapshot of the current manifest
nsyte snapshot --title "v1.2.3" --description "Release v1.2.3"   # label this snapshot only
nsyte browse                   # interactive TUI (requires a TTY)
```

Most of these accept `-p, --pubkey <npub|hex|name@domain>` to inspect someone else's site,
`-d, --name <id>` for named sites (`put` uses `-n, --name`), `-r, --relays`, and
`--use-fallback-relays`. `put` requires an existing manifest — deploy at least once first.

---

## Local Preview and Debugging

```bash
nsyte serve -d ./dist -p 8080      # plain static file server for local files
nsyte run                          # local nsite resolver: http://<npub>.localhost:6798
nsyte run npub1... --port 6798     # resolve a specific site (npub, hex, or naddr)
nsyte debug                        # check profile, relay list, server list, manifest, blob integrity
nsyte debug npub1... --verbose --show-events
```

---

## Metadata Without Redeploying

```bash
nsyte announce --publish-app-handler         # kind 31990 from config.appHandler
nsyte announce --publish-app-recommendation  # kind 31989
nsyte announce --all
nsyte announce --all --dry-run --dry-run-show-kinds 31990,31989
```

Alias: `nsyte annc`. Publishes to configured relays + discovery relays + the user's NIP-65 outbox.

---

## Removing Sites

Both commands are destructive and cannot be undone. Confirm with the user first.

```bash
nsyte delete --dry-run                 # preview the NIP-09 delete event
nsyte delete                           # delete the manifest from relays (prompts y/N)
nsyte delete --include-blobs           # also delete blobs from Blossom servers
nsyte delete -d blog -y                # named site, skip confirmation (CI only)

nsyte undeploy --dry-run
nsyte undeploy                         # delete ALL blobs + manifest; type-to-confirm
nsyte undeploy -d blog --yes --sec "$NBUNK_SECRET"
```

`delete` (aliases `purge`, `prg` — deprecated) is selective; `undeploy` always removes blobs and the
manifest. Relays may not honor delete requests; treat deletion as best-effort.

---

## CI/CD

### Step 1: Generate a CI credential (one-time, on a dev machine)

```bash
nsyte ci
nsyte ci 'bunker://<pubkey>?relay=wss://relay.example.com&secret=xxx'
```

Prints an `nbunksec1…` string **once** and never stores it. Save it as a CI secret (e.g.
`NBUNK_SECRET`). Prefer a dedicated bunker connection for CI so it can be revoked independently.

### Step 2: Deploy from the pipeline

```bash
nsyte scan ./dist --scan-level high --quiet
nsyte validate
nsyte deploy ./dist --non-interactive --sec "$NBUNK_SECRET"
```

Pass the credential with `--sec`. There is no `NBUNK_SECRET`-style environment variable read by
nsyte itself — the name of the secret is up to you.

### GitHub Actions example

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: curl -fsSL https://nsyte.run/get/install.sh | bash
      - run: nsyte validate
      - run: nsyte deploy ./dist --non-interactive --sec "${{ secrets.NBUNK_SECRET }}"
```

### CI checklist

- [ ] `.nsite/config.json` committed (it holds no secrets) or generated in the job
- [ ] `NBUNK_SECRET` set to the `nbunksec1…` string from `nsyte ci`
- [ ] `--non-interactive` on `deploy` (and `--yes` on any `delete`/`undeploy`)
- [ ] `nsyte scan` and `nsyte validate` run before `deploy`

---

## Command Index

| Command                                | Purpose                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `nsyte init`                           | Interactive project setup → `.nsite/config.json`                   |
| `nsyte config`                         | Interactive config editor (TUI)                                    |
| `nsyte validate`                       | Validate config against the schema (exit 0/1)                      |
| `nsyte deploy <dir>`                   | Deploy a directory (aliases: `upload`, `dpl`)                      |
| `nsyte scan [dir]`                     | Scan for secrets before deploying (exit 0/1)                       |
| `nsyte list [path]`                    | Show the published file tree (alias: `ls`)                         |
| `nsyte status [path]`                  | Relay/server coverage and manifest history                         |
| `nsyte sites`                          | List root + named sites for a pubkey                               |
| `nsyte get <remote-path>`              | Download one published file (stdout or `-o`)                       |
| `nsyte put <local-file> <remote-path>` | Upload one file and update the manifest                            |
| `nsyte download`                       | Download the whole site (alias: `dl`)                              |
| `nsyte snapshot`                       | Publish an immutable kind 5128 snapshot                            |
| `nsyte announce`                       | Publish NIP-89 handler/recommendation events (alias: `annc`)       |
| `nsyte browse`                         | Interactive TUI file browser                                       |
| `nsyte serve`                          | Serve local files over HTTP (alias: `srv`)                         |
| `nsyte run [npub\|naddr]`              | Local nsite resolver with `*.localhost` subdomains (alias: `rn`)   |
| `nsyte debug [npub]`                   | Diagnose relays, servers, manifest, and blob integrity             |
| `nsyte delete`                         | Remove the manifest (and optionally blobs); aliases `purge`, `prg` |
| `nsyte undeploy`                       | Remove all blobs and the manifest                                  |
| `nsyte ci [bunker-url]`                | Generate an `nbunksec` for CI (printed once)                       |
| `nsyte bunker <subcommand>`            | Manage NIP-46 bunkers                                              |

Full per-command reference: `https://nsyte.run/docs/usage/commands`.

---

## Troubleshooting

### Auth errors

- **"No valid signing method" / "No key configuration found and running in non-interactive mode":**
  pass `--sec`, or run `nsyte bunker use <pubkey>` to link a stored bunker.
- **"No stored credential":** `bunkerPubkey` is set but the secrets-backend entry is missing
  (different machine, wiped keychain). Fix: `nsyte bunker connect …` then
  `nsyte bunker use <pubkey>`, or `nsyte bunker import <nbunksec>`.
- **Bunker URL rejected / truncated:** the shell consumed `?`/`&`. Single-quote the URL.
- **Bunker never approves:** the signer app (Amber, nsec.app, etc.) must be online and the relay in
  the bunker URL reachable. Try a different relay in the `bunker://` URL.

### Deploy errors

- **Secrets scan blocked the deploy:** review findings; remove the secret from the build output, or
  lower `--scan-level` / use `--skip-secrets-scan` only when the user confirms false positives.
- **Manifest published to zero relays:** check `relays` are valid `wss://` URLs and reachable; try
  `--use-fallback-relays`.
- **Blob upload rejected (401/413/5xx):** the server may require payment/allow-listing or cap file
  size. Add another server in `servers` or try `--use-fallback-servers`.
- **Partial uploads:** rerun `nsyte deploy ./dist --sync` to fill in missing blobs on lagging
  servers; check with `nsyte status`.
- **Config missing:** run `nsyte init`, or create `.nsite/config.json` (see Project Setup).
- **Named site `id` rejected:** must match `[a-z0-9-]{1,13}` (NIP-5A).

### Config errors

- **"Config editor requires interactive terminal":** edit JSON directly, then `nsyte validate`.
- **Validation fails:** malformed URLs, `publishAppHandler: true` without `appHandler.kinds`, or
  `publishProfile`/`publishRelayList`/`publishServerList` on a named site (root sites only).
- **`bunkerPubkey` format:** 64 hex chars (not `npub`). Always set with `nsyte bunker use`.

### Linux keychain issues

Credentials not persisting → install `libsecret` (`secret-tool`) and a running keyring, or set
`NSYTE_FORCE_ENCRYPTED_STORAGE=true` to use the encrypted-file backend.
