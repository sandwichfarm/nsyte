---
title: put
description: Upload one file and update an existing site manifest
---

# put

Upload a single local file to the configured Blossom servers and update the site's manifest event so
the new blob is referenced at the given remote path. The command requires an existing manifest —
`put` is for incremental edits to a site that has already been deployed at least once with
[`deploy`](deploy.md). If the remote path looks like a directory (ends in `/` or has no extension),
the local file's basename is appended automatically.

## Usage

```bash
nsyte put <local-file> <remote-path> [options]
```

## Arguments

- `<local-file>` — Path to the local file to upload
- `<remote-path>` — Path inside the site manifest where the file should be recorded (e.g.
  `/about.html`, `assets/`). When the path looks like a directory, the local file's basename is used
  as the final segment.

## Options

- `--sec <secret>` — Secret for signing (auto-detects format: nsec, nbunksec, bunker:// URL, or
  64-char hex)
- `-n, --name <name>` — The site identifier for named sites (kind 35128). If not provided, updates
  the root site (kind 15128)

## Examples

Replace a single file in the root site:

```bash
nsyte put ./dist/index.html /index.html
```

Upload a new asset into a directory path (basename is appended):

```bash
nsyte put ./logo.svg assets/
```

Update a file in a named site:

```bash
nsyte put ./dist/about.html /about.html -n docs
```

## See Also

- [`nsyte deploy`](deploy.md) — Deploy an entire directory at once
- [`nsyte get`](get.md) — Download a single file from a site manifest

Inherits global options. See [global options](_global-options.md).
