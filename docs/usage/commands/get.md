---
title: get
description: Download one file from a site manifest
---

# get

Download a single file from a published site manifest. By default the file
contents are written to standard output, which makes `get` useful for piping
into other tools or quickly inspecting a deployed asset; pass `-o` to save the
file to disk instead. The command resolves the manifest from the configured (or
specified) relays, then tries the configured Blossom servers, the manifest's
declared servers, and the owner's public Blossom server list in turn until the
blob is found.

## Usage

```bash
nsyte get <remote-path> [options]
```

## Arguments

- `<remote-path>` — Path of the file inside the site manifest (e.g.
  `/index.html`, `assets/logo.svg`). Leading slash is optional and a single
  slash is added automatically.

## Options

- `-o, --output <file>` — Write the downloaded file to disk instead of stdout
- `-r, --relays <relays>` — The nostr relays to use (comma separated)
- `-s, --servers <servers>` — The blossom servers to try first (comma separated)
- `-p, --pubkey <npub>` — The public key to download from (npub, hex, or NIP-05
  identifier like `name@domain.com`)
- `-d, --name <name>` — The site identifier for named sites (kind 35128). If
  not provided, uses the root site (kind 15128)

## Examples

Print the deployed `index.html` to stdout:

```bash
nsyte get /index.html
```

Pipe a deployed file into another tool:

```bash
nsyte get /robots.txt | head
```

Save a deployed asset to disk:

```bash
nsyte get assets/logo.svg -o ./logo.svg
```

Download from a specific public key without using the project config:

```bash
nsyte get /index.html -p npub1exampleexampleexampleexampleexample -o ./index.html
```

Download a file from a named site:

```bash
nsyte get /index.html -d docs -o ./docs-index.html
```

## See Also

- [`nsyte download`](download.md) — Download all files from a site
- [`nsyte ls`](ls.md) — List files in a site manifest

Inherits global options. See [global options](_global-options.md).
