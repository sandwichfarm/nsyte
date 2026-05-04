---
title: scan
description: Scan a directory for secrets before deploying
---

# scan

Scan a local directory for accidentally committed secrets (API keys, tokens,
private keys, and similar credentials) before publishing it. This is the same
secrets pre-check that [`nsyte deploy`](deploy.md) runs by default; running
`scan` explicitly is useful in CI or as a standalone audit. The command exits
with status `1` when at least one finding is reported and `0` when the
directory is clean.

## Usage

```bash
nsyte scan [folder] [options]
```

## Arguments

- `[folder]` — Directory to scan. Defaults to the current working directory.

## Options

- `--scan-level <level>` — Scan sensitivity level: `low`, `medium`, or `high`
  (default: `medium`). Unknown values fall back to `medium`.
- `-q, --quiet` — Show summary only, no findings detail (default: `false`)
- `-v, --verbose` — Show verbose output with extra context (default: `false`)

## Examples

Scan the current directory at the default sensitivity:

```bash
nsyte scan
```

Scan a specific build directory at high sensitivity, summary only (CI-friendly):

```bash
nsyte scan dist --scan-level high --quiet
```

Scan with extra context for each finding:

```bash
nsyte scan ./public --verbose
```

## See Also

- [`nsyte deploy`](deploy.md) — Deploy a directory; `scan` runs as a pre-check
  by default. Pass `--skip-secrets-scan` to disable.

Inherits global options. See [global options](_global-options.md).
