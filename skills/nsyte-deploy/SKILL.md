---
name: nsyte-deploy
description: Deploys a static site to the Nostr network and Blossom servers using nsyte. Use when the user wants to publish, upload, deploy, or host a website on Nostr, Blossom, or a decentralized hosting system using nsyte.
metadata:
  disable-model-invocation: true
---

## Prerequisites

- nsyte must be installed and available in PATH (see `nsyte-setup` skill if not installed)
- `.nsite/config.json` should exist (created by `nsyte init`)
  - Exception: in interactive mode, `nsyte deploy` will auto-run setup if no config is found
  - In non-interactive/CI mode, config must exist before deploying
- For Nostr/Blossom domain concepts (relays, pubkeys, NIP-46, Blossom servers), see the
  `nsyte-concepts` skill or `.agents/skills/nsyte-concepts/references/nostr-concepts.md`

---

## Authentication

nsyte resolves authentication using the following priority order:

### Priority 1: `--sec` flag

Provide a secret directly via the CLI flag or from an environment variable:

```bash
nsyte deploy ./dist --sec "nsec1..."
nsyte deploy ./dist --sec "${NBUNK_SECRET}"   # CI/CD: env var value passed as flag
```

Accepted formats (auto-detected, no format flag needed):

| Format | Example prefix | Use case |
|--------|---------------|----------|
| Nostr private key (bech32) | `nsec1...` | Direct key auth |
| Bunker credential (bech32) | `nbunksec1...` | CI/CD preferred |
| Bunker URL | `bunker://...` | NIP-46 remote signer |
| Raw hex private key | `<64 hex chars>` | Raw key auth |

**CRITICAL:** Do NOT pass private keys as visible shell arguments unless necessary — shell
history captures CLI arguments. Prefer bunker credentials (`nbunksec1...`) for CI/CD.

**CRITICAL:** nsyte does not read a `NSYTE_NSEC` or similar environment variable directly.
The CI/CD pattern is to pass the env var value via `--sec "${ENV_VAR}"`.

### Priority 2: Stored bunker from `.nsite/config.json`

If `--sec` is not provided, nsyte checks for a stored bunker:
- `config.bunkerPubkey` must be set in `.nsite/config.json`
- The corresponding nbunksec must be stored in the OS keychain (or encrypted fallback)
- If stored credential is missing:
  - Interactive mode: prompts user to reconnect
  - Non-interactive mode: errors with actionable message

### If neither is available

nsyte exits with an error:
> "No valid signing method could be initialized. Please provide --sec with nsec, nbunksec,
> bunker URL, or hex key, or configure a bunker in .nsite/config.json."

---

## Deploy Workflow

```bash
# 1. Navigate to project root (where .nsite/config.json lives)
cd /path/to/your/project

# 2. Run deploy with your build output directory
nsyte deploy ./dist

# 3. Watch the output for success/partial/failure status (see below)
```

### Common flags

| Flag | Purpose |
|------|---------|
| `--sec <value>` | Provide signing key/credential (see Authentication above) |
| `--force` | Re-upload all files, even unchanged ones |
| `--fallback=/index.html` | SPA fallback for client-side routing |
| `--non-interactive` | CI mode — disables interactive prompts, fails fast |

For the full flag list: `nsyte deploy --help`

---

## Deploy Output Interpretation

After running `nsyte deploy`, interpret the result by the final status line:

### Full success

```
{N} files uploaded successfully ({size})
```

All files uploaded to all configured Blossom servers. Gateway URL is printed:
```
https://{npub}.nsite.lol/
```

### Partial success

```
{uploaded}/{total} files uploaded successfully ({size})
```

Some files failed. Check the **Blossom Server Summary** section printed below the status line
for per-server success/failure counts. Some servers may be down or rejecting uploads.

### Total failure

```
Failed to upload any files
```

No files uploaded. Check:
- **Relay Issues** section — printed when relay-rejection or connection errors occurred
- **Blossom Server Summary** section — shows per-server failure details
- **Errors** section — shows specific error messages

After any deploy attempt, the gateway URL is still printed for reference.

---

## Error Recovery

### Relay unavailable

Symptom: "Relay Issues" section shows `connection-error` or `relay-rejection`

```
# Option 1: Check relay URLs in config
cat .nsite/config.json   # verify "relays" array has valid wss:// URLs

# Option 2: Use fallback relays
nsyte deploy ./dist --use-fallback-relays
```

### Blossom server rejection

Symptom: "Blossom Server Summary" shows low success counts or per-server errors

```
# Check server list in config
cat .nsite/config.json   # verify "servers" array has valid https:// URLs
# Try deploying with a different or additional Blossom server
# Add servers via: nsyte config
```

### Auth error

Symptom: Deploy fails immediately with signing or authentication error

Decision tree:
1. Using `--sec`? Verify the value format is one of: nsec1..., nbunksec1..., bunker://..., 64-char hex
2. Using stored bunker? Re-connect: `nsyte bunker connect '<bunker://...>'`
3. nbunksec may have expired — generate a new one from your signer app

### Config missing

Symptom: "Config file not found" or similar

```
# Run interactive setup first
nsyte init
# Then retry deploy
nsyte deploy ./dist
```

---

## Non-Interactive / CI Mode

For automated pipelines (GitHub Actions, CI systems):

```bash
# Requires .nsite/config.json committed or provided separately
# Auth via --sec flag with env var value

nsyte deploy ./dist \
  --non-interactive \
  --sec "${NBUNK_SECRET}"
```

Checklist:
- [ ] `.nsite/config.json` exists in the repo or is provided by the pipeline
- [ ] `NBUNK_SECRET` is set to an `nbunksec1...` string in the CI environment
- [ ] `--non-interactive` flag is present to prevent hangs on prompts
- [ ] Exit code 0 = success, non-zero = failure — use for pipeline status checks

For a full GitHub Actions example, see `README.md` in the nsyte repository.
