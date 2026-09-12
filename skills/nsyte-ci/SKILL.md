---
name: nsyte-ci
description: Deploy nsites (Nostr/Blossom static sites) from CI/CD pipelines. Covers generating an nbunksec CI credential with `nsyte ci`, the sandwichfarm/nsite-action GitHub Action (inputs, defaults, traps), building a pinned-binary pipeline for GitHub Actions, GitLab CI, or any other runner, post-deploy snapshots for release tagging, secret handling, and CI troubleshooting. Use when the user wants to deploy an nsite from GitHub Actions, GitLab CI, or another pipeline, mentions nsite-action, nbunksec, or automating nsyte deploys.
license: MIT
metadata:
  author: sandwichfarm
  repository: https://github.com/sandwichfarm/nsyte
  homepage: https://nsyte.run
  docs: https://nsyte.run/docs/guides/ci-cd
  action: https://github.com/sandwichfarm/nsite-action
---

# nsyte in CI/CD

This skill covers automating nsite deploys. For the CLI itself (install, config, auth, deploy flags,
inspecting sites, troubleshooting) use the companion `nsyte` skill — the rules there (never print
secrets, prefer `--dry-run`, confirm destructive commands) apply here too.

Two paths:

| Runner                   | Use                                                                             |
| ------------------------ | ------------------------------------------------------------------------------- |
| GitHub Actions           | [`sandwichfarm/nsite-action`](#github-actions-nsite-action) (deploy only)       |
| Anything else / advanced | [Pinned nsyte binary](#any-ci-pinned-binary) + `nsyte deploy --non-interactive` |

Both need the same credential, generated once on a dev machine.

---

## Step 1: Generate a CI credential

`nsyte ci` connects to the user's NIP-46 bunker (signer app such as Amber or nsec.app) and prints an
`nbunksec1…` string **once**. It is never written to disk.

```bash
nsyte ci                      # interactive: scan QR / paste bunker URL at the prompt
nsyte ci '<bunker-url>'       # non-interactive, URL from the signer app
```

Then:

1. Store the printed value as a pipeline secret. Any name works; this skill uses `NBUNK_SECRET`.
2. Prefer a **dedicated bunker connection for CI** so it can be revoked without touching the user's
   other clients. Revocation happens in the signer app, not in nsyte.
3. Never use a raw private key (`nsec1…` / hex) in CI. `nsite-action` rejects it outright; the CLI
   accepts it but it cannot be revoked if leaked.

The agent must not run `nsyte ci` on the user's behalf and paste the output anywhere — it prints a
credential. Tell the user to run it and store the value themselves.

The signer app must be **online and reachable** on the relay in the bunker URL whenever the pipeline
signs. A CI run that hangs at "waiting for bunker" means the signer is offline.

---

## GitHub Actions: nsite-action

`sandwichfarm/nsite-action` downloads a pinned nsyte release binary for the runner OS, builds an
effective config, validates it, and runs `nsyte deploy <directory> -i --sec <credential>` with
secrets masked in logs. Latest release: `v0.7.0`.

### Minimal workflow

```yaml
name: Deploy nsite

on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - name: Deploy to Nostr/Blossom
        uses: sandwichfarm/nsite-action@v0.7.0
        with:
          nbunksec: ${{ secrets.NBUNK_SECRET }}
          directory: ./dist
          version: v0.28.1
          skip_secrets_scan: "false"
          config_path: .nsite/config.json
```

With a committed `.nsite/config.json` (it holds no secrets) this is the whole deploy. Without one,
pass `relays` and `servers` inline (newline-separated):

```yaml
with:
  nbunksec: ${{ secrets.NBUNK_SECRET }}
  directory: ./dist
  version: v0.28.1
  skip_secrets_scan: "false"
  title: My Site
  relays: |
    wss://relay.nsite.lol
  servers: |
    https://cdn.hzrd149.com
    https://cdn.sovbit.host
```

### Inputs

| Input                                                          | Default      | Notes                                                                                                                             |
| -------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `nbunksec`                                                     | —            | The `nbunksec1…` from `nsyte ci`. Must start with `nbunksec1`; `sec1…` values are rejected.                                       |
| `sec`                                                          | —            | Compatibility input passed straight to `--sec`. Prefer `nbunksec`.                                                                |
| `directory`                                                    | —            | **Required.** Build output to upload.                                                                                             |
| `version`                                                      | `latest`     | nsyte release tag (`v0.28.1`). **Always pin** — `latest` makes deploys non-reproducible.                                          |
| `config_path`                                                  | `''`         | Path to a config JSON, relative to the repo root, no `..`. Validated with `nsyte validate --file` before deploy.                  |
| `relays`, `servers`                                            | `''`         | Newline-separated. When set they **replace** the config's arrays, not merge.                                                      |
| `name`                                                         | `''`         | Deploy a named site (`--name`, kind 35128). Empty = root site.                                                                    |
| `title`, `description`                                         | `''`         | NIP-5A metadata written into an effective config (overrides the committed config's values).                                       |
| `fallback`                                                     | `''`         | SPA fallback path, e.g. `/index.html` (`--fallback`).                                                                             |
| `skip_secrets_scan`                                            | `true`       | **Default skips the scan.** Set `"false"` so `deploy` scans for leaked credentials first. Optional `scan_level`: low/medium/high. |
| `force`, `sync`, `verbose`, `concurrency`                      | see docs     | Map to `--force`, `--sync`, `--verbose`, `--concurrency`.                                                                         |
| `created_at`                                                   | `''`         | Override event timestamp (epoch seconds or ISO 8601) via global `--created-at`. Needs nsyte ≥ v0.26.0.                            |
| `publish_relay_list`, `publish_server_list`, `publish_profile` | `false`      | Root sites only. Map to `--publish-relay-list`, `--publish-server-list`, `--publish-profile`.                                     |
| `publish_app_handler`, `handler_kinds`                         | `false`/`''` | NIP-89 handler (`--publish-app-handler`, `--handler-kinds`).                                                                      |
| `use_fallback_relays`, `use_fallback_servers`                  | `false`      | Add nsyte's built-in defaults (`--use-fallback-relays`, `--use-fallback-servers`).                                                |
| `purge`                                                        | `false`      | **Deprecated, no-op.** Use `nsyte delete` / `nsyte undeploy` from the CLI instead.                                                |

Outputs: `status` (`success` / `failure`) and `nsyte_version_used`.

### Traps

- **`skip_secrets_scan` defaults to `true`** — the opposite of the CLI. Set it to `"false"` unless
  the user has confirmed the scan produces false positives on their build.
- **`version` defaults to `latest`.** Pin it.
- **The action only runs `deploy`.** `snapshot`, `announce`, `delete`, `undeploy`, `status` are not
  available through it. For those, add a [pinned-binary step](#any-ci-pinned-binary) after the
  action; the binary the action downloaded is an implementation detail, do not rely on its path.
- **No `--dry-run` through the action.** To preview what a workflow would publish, run
  `nsyte deploy ./dist --dry-run` locally or in a pinned-binary step.
- **`relays`/`servers` inputs replace, not extend,** the committed config. To add the defaults on
  top, use `use_fallback_relays` / `use_fallback_servers`.
- **`purge` does nothing.** There is no deploy-time purge; removal is a separate CLI command that
  should never run unattended without explicit user intent.
- **Linux, macOS, and Windows runners are supported**; the action installs `jq` if missing (via
  apt/brew/choco), which needs `sudo` on Linux runners.

---

## Any CI: pinned binary

Use this for GitLab CI, Woodpecker, Drone, Jenkins, a plain shell script, or on GitHub when you need
commands other than `deploy`. Download the release asset for the runner, verify it runs, then call
nsyte directly. Asset names: `nsyte-linux-<ver>`, `nsyte-macos-arm64-<ver>`,
`nsyte-macos-x64-<ver>`, `nsyte-windows-<ver>.exe`.

### Pipeline steps

```bash
# 1. Install a pinned release
NSYTE_VERSION=0.28.1
curl -fsSLo /usr/local/bin/nsyte \
  "https://github.com/sandwichfarm/nsyte/releases/download/v${NSYTE_VERSION}/nsyte-linux-${NSYTE_VERSION}"
chmod +x /usr/local/bin/nsyte
nsyte --version

# 2. Gate: fail on leaked secrets and bad config before touching the network
nsyte scan ./dist --scan-level high --quiet
nsyte validate

# 3. Deploy
nsyte deploy ./dist --non-interactive --sec "$NBUNK_SECRET"
```

`--non-interactive` (`-i`) is required: without a TTY any prompt hangs the job. `--sec` reads the
credential from the pipeline's secret store; nsyte reads no environment variable itself, the name is
yours. Never echo the variable or pass a literal.

### GitHub Actions (pinned binary)

```yaml
- name: Install nsyte
  run: |
    curl -fsSLo /usr/local/bin/nsyte \
      https://github.com/sandwichfarm/nsyte/releases/download/v0.28.1/nsyte-linux-0.28.1
    chmod +x /usr/local/bin/nsyte
- run: nsyte scan ./dist --scan-level high --quiet
- run: nsyte validate
- run: nsyte deploy ./dist --non-interactive --sec "${{ secrets.NBUNK_SECRET }}"
```

### GitLab CI

```yaml
deploy-nsite:
  stage: deploy
  image: debian:bookworm-slim
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  before_script:
    - apt-get update -qq && apt-get install -y -qq curl ca-certificates
    - curl -fsSLo /usr/local/bin/nsyte
      https://github.com/sandwichfarm/nsyte/releases/download/v0.28.1/nsyte-linux-0.28.1
    - chmod +x /usr/local/bin/nsyte
  script:
    - nsyte scan ./dist --scan-level high --quiet
    - nsyte validate
    - nsyte deploy ./dist --non-interactive --sec "$NBUNK_SECRET"
```

Mark `NBUNK_SECRET` as **masked** and **protected** in GitLab's CI variables.

### Overriding config per environment

`nsyte deploy` accepts `--relays`, `--servers` (comma-separated), `--name`, `--fallback`, and the
global `--config <file>` to point at an alternative config, so staging vs production can share one
repo:

```bash
nsyte --config .nsite/staging.json deploy ./dist -i --sec "$NBUNK_SECRET"
nsyte deploy ./dist -i --name preview-${CI_COMMIT_SHORT_SHA} --sec "$NBUNK_SECRET"
```

Named sites (`--name`) are separate kind 35128 manifests under the same pubkey, so a per-branch
preview does not disturb the root site. Clean them up with `nsyte delete -d <name> -y` — only in a
job the user has explicitly asked to be destructive.

---

## Snapshots as release markers

A snapshot (`nsyte snapshot`) publishes an immutable kind 5128 event that pins the **currently
published** manifest's aggregate hash and file set. It reads that manifest from the relays, so it
must run after a successful deploy has propagated — never before, and never on a build that did not
deploy.

```bash
nsyte deploy ./dist --non-interactive --sec "$NBUNK_SECRET"
nsyte snapshot --sec "$NBUNK_SECRET" --title "v${TAG}" --description "Release ${TAG}"
```

- `--title` / `--description` label **this snapshot only**; the live manifest is not rewritten.
  Omitted, they inherit from the manifest. `--no-title` / `--no-description` drop the inherited tag.
- `-d <name>` snapshots a named site; without it, the root site.
- The hash and file set always come from the manifest and cannot be overridden.
- `snapshot` has no `--non-interactive` flag; with `--sec` it never prompts.
- Preview with `--dry-run` in the same job first if the pipeline is new.
- nsyte has no command to list snapshots; they are visible to relay clients that query kind 5128 by
  author.
- Not available through `nsite-action` — use a pinned-binary step.

Typical trigger: a job that runs only on `v*` tags, after the deploy job.

---

## Checklist

- [ ] `nbunksec1…` from `nsyte ci` stored as a masked pipeline secret; no `nsec`/hex key in CI
- [ ] nsyte version pinned (`version:` input or release URL)
- [ ] `.nsite/config.json` committed (no secrets in it) **or** relays/servers passed explicitly
- [ ] Secrets scan enabled: `skip_secrets_scan: "false"` / `nsyte scan` step
- [ ] `nsyte validate` before deploy
- [ ] `--non-interactive` on `deploy`; `--yes` only on `delete`/`undeploy` the user asked for
- [ ] Deploy job restricted to the release branch/tag; PR builds use `--dry-run` or skip deploy
- [ ] Signer app for the CI bunker is online during runs

---

## Troubleshooting

- **Job hangs, then times out** — a prompt was hit without a TTY. Add `--non-interactive`; with the
  action, this is automatic.
- **"waiting for bunker" / NIP-46 timeout** — the signer app is offline or not on the relay in the
  bunker URL. Start the signer; check the relay is reachable from the runner.
- **"No signing method provided"** — `--sec`/`nbunksec` was empty. GitHub does not expose secrets to
  workflows triggered from forks; check the secret name and job conditions.
- **"No stored bunker found for pubkey …"** — the committed config has a `bunkerPubkey` but the
  runner has no keychain entry for it (it never will). Pass `--sec` in CI; the stored bunker is a
  dev-machine convenience only.
- **`nbunksec` input rejected** — the value starts with `sec1`. Generate an `nbunksec1…` with
  `nsyte ci` instead.
- **Secrets scan blocked the deploy** — inspect the findings; remove the credential from the build
  output. Only lower `scan_level` / set `skip_secrets_scan: "true"` after the user confirms they are
  false positives.
- **Config validation failed** — `config_path` must be relative to the repo root and match
  `https://nsyte.run/schemas/config.schema.json`; run `nsyte validate` locally.
- **Asset download 404** — the release tag or asset name is wrong; list assets at
  `https://github.com/sandwichfarm/nsyte/releases/tag/v<ver>`.
- **Manifest published to zero relays** — relays unreachable from the runner (firewalled egress or
  `ws://`/`wss://` mismatch). Try `--use-fallback-relays` to isolate.
- **Snapshot says "No manifest found"** — the deploy has not propagated to the relays being queried,
  or the job ran against a different pubkey/name than the deploy.
