---
title: ci
description: Create an nbunksec string for CI/CD use
---

# ci

Create an nbunksec string for CI/CD use (creates a new bunker connection).

## Usage

```bash
nsyte ci [url]
```

- `[url]`: (Optional) Bunker URL to use for the connection

## Description

This command creates a new bunker connection and outputs an `nbunksec` string, which can be used as a secret in CI/CD pipelines for automated deployments.

## Example

Create a new nbunksec string interactively:
```bash
nsyte ci
```

Create a new nbunksec string using a specific bunker URL:
```bash
nsyte ci bunker://pubkey?relay=wss://relay.example&secret=xxx
``` 