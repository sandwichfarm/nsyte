---
title: ci
description: Create an nbunksec string for CI/CD use
---

# ci

Create an nbunksec string for CI/CD use. The connection is **ephemeral** — the
nbunksec is printed to stdout and never written to disk or the project config.

## Usage

```bash
nsyte ci [url]
```

- `[url]`: (Optional) Bunker URL to use for the connection

## Description

This command creates a bunker connection and outputs an `nbunksec` string, which can be used as
a secret in CI/CD pipelines for automated deployments. Unlike `nsyte bunker connect`, it never
persists the credential — it skips the keychain/encrypted store entirely, so the only copy is the
string it prints.

## Example

Create a new nbunksec string interactively:

```bash
nsyte ci
```

Create a new nbunksec string using a specific bunker URL:

```bash
nsyte ci 'bunker://pubkey?relay=wss://relay.example&secret=xxx'
```

## See Also

- [`nsyte bunker`](bunker.md) — Manage stored NIP-46 bunker connections

Inherits global options. See [global options](_global-options.md).
