---
name: nsyte-ci
description: Configures nsyte for non-interactive CI/CD deployment of Nostr-hosted static sites using environment variable authentication and the --non-interactive flag. Use when the user wants to automate nsyte deploys in a CI pipeline, GitHub Actions, or any headless environment.
---

## Prerequisites

- nsyte installed on the **developer's machine** for credential generation (see `nsyte-setup` skill)
- An existing bunker connection, OR a `bunker://...` URL from your signer app
  (see `nsyte-auth` skill for how to set up a bunker and get a bunker URL)
- `.nsite/config.json` committed to the repository or available in the CI environment
  (see `nsyte-deploy` skill for config requirements)

---

## Step 1: Generate a CI Credential (one-time, on developer machine)

Run `nsyte ci` to generate an ephemeral `nbunksec1...` credential for your pipeline.

**Interactive (prompts for connection method):**
```bash
nsyte ci
```

**Direct URL (single-quote required):**
```bash
nsyte ci 'bunker://pubkey?relay=wss://relay.example.com&secret=xxx'
```

**CRITICAL:** The `nbunksec1...` string is printed **once** and **never stored to disk**.
Copy it immediately before closing the terminal.

After copying, store it in your CI platform's secrets manager:
- GitHub Actions: add as a repository secret (e.g., `NBUNK_SECRET`)
- Other platforms: use their equivalent encrypted secrets mechanism

---

## Step 2: Configure the CI Pipeline

Use `nsyte deploy` with `--non-interactive` and `--sec` in your pipeline:

```bash
nsyte deploy ./dist --non-interactive --sec "${NBUNK_SECRET}"
```

**CRITICAL:** Use `--sec` (NOT `--nbunksec` — that flag does not exist despite appearing in the
README). `--sec` auto-detects all credential formats including `nbunksec1...` strings.

`--non-interactive` prevents the CLI from waiting on prompts in headless environments.

---

## GitHub Actions Example

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: nsyte deploy ./dist --non-interactive --sec "${{ secrets.NBUNK_SECRET }}"
```

---

## CI Pre-flight Checklist

| Check | How to Verify |
|-------|---------------|
| Config file exists | `.nsite/config.json` committed or provided as pipeline artifact |
| Secret is set | `NBUNK_SECRET` env var contains an `nbunksec1...` string |
| Non-interactive flag present | `--non-interactive` in the deploy command |
| Config is valid (optional) | Run `nsyte validate` before deploy; exits 1 on invalid config |

---

## Handling Partial Success

Deploy exits 0 even when only some servers succeed (partial upload). To catch partial failures:

1. Check the `N/M files uploaded` line in the deploy output
2. If `N < M`, some servers failed — this is a partial success
3. For strict CI pipelines, parse the output and fail the job if `N < M`

Exit codes:
- `0` = deploy ran (all files uploaded, or partial upload)
- Non-zero = deploy failed (auth error, config missing, or no files uploaded)
