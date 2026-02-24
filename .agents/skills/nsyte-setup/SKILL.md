---
name: nsyte-setup
description: Installs nsyte, the CLI for deploying static sites to the decentralized Nostr network. Use when the user wants to install nsyte, check if nsyte is installed, set up nsyte for the first time, or troubleshoot installation on Linux, macOS, or Windows.
---

## Prerequisites

Before attempting the Deno-based install path, verify the Deno runtime is available:

```bash
deno run --allow-run scripts/check-deno.ts
```

Note: The recommended binary install path (`curl | bash`) does NOT require Deno. The Deno
runtime is only required if you use the `deno install` alternative.

## Detect Installation

Run:

```bash
nsyte --version
```

- If exits 0 and prints a version string (e.g., `nsyte 0.x.y`): nsyte is already installed.
  Skip to [Initialize Project](#initialize-project).
- If command not found or exits non-zero: nsyte is not installed.
  Proceed to [Install nsyte](#install-nsyte).

## Install nsyte

Choose a method based on your platform:

### Linux / macOS — Recommended (pre-built binary, no Deno required)

```bash
curl -fsSL https://nsyte.run/get/install.sh | bash
```

This installs the binary to `/usr/local/bin/nsyte`. No Deno runtime needed.

### Linux / macOS — Alternative (requires Deno 2.x)

```bash
deno install -A -f -g -n nsyte jsr:@nsyte/cli
```

Use `scripts/check-deno.ts` to confirm Deno 2.x is present before running this.

### Windows

1. Download the latest release binary from:
   `https://github.com/sandwichfarm/nsyte/releases`
2. Copy `nsyte.exe` to `%USERPROFILE%\bin\` (create the directory if it does not exist).
3. Add `%USERPROFILE%\bin` to your `PATH` environment variable.
   (System Settings → Advanced → Environment Variables → Path → Edit → New)

## Verify Installation

After installing, confirm the binary is accessible:

```bash
nsyte --version
```

- If exits 0: installation succeeded. Proceed to [Initialize Project](#initialize-project).
- If command not found: PATH not updated. See [Troubleshooting](#troubleshooting).

## Initialize Project

Run `nsyte init` in your project root to create `.nsite/config.json`:

```bash
cd /path/to/your/project
nsyte init
```

The interactive prompts will ask for:

1. **Auth method** — choose one:
   - Generate a new Nostr private key
   - Enter an existing key (nsec bech32 or 64-char hex)
   - Connect a NIP-46 bunker (for hardware signers or shared keys)

2. **Relay configuration** — enter one or more relay WebSocket URLs
   (e.g., `wss://relay.damus.io`). Press Enter after each; leave blank when done.

3. **Blossom server configuration** — enter one or more Blossom server HTTP URLs
   (e.g., `https://blossom.primal.net`). Press Enter after each; leave blank when done.

On success, nsyte prints:

```
Project initialized successfully with: ...
```

and writes `.nsite/config.json`. Do not manually edit this file.

After init, proceed to the `nsyte-deploy` skill for deploying your site.

## Validate Network Prerequisites (optional)

To confirm relay and Blossom server connectivity before deploying:

```bash
deno run --allow-net scripts/check-network.ts
```

This checks `relay.damus.io` and `blossom.primal.net` and exits 0 if both are reachable.

## Troubleshooting

### Command not found after install

The install directory is not in your `PATH`.

**Linux/macOS:** Add to your shell profile and reload:

```bash
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
# or for zsh:
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Windows:** Verify `%USERPROFILE%\bin` is in your PATH (see Install steps above).
Restart your terminal or PowerShell after updating PATH.

### Permission denied on Linux

If `/usr/local/bin` is not writable:

```bash
sudo curl -fsSL https://nsyte.run/get/install.sh | bash
```

Or install to a user-writable location and update PATH accordingly.

### Deno version too old (deno install path only)

The `deno install` path requires Deno 2.x. Check your version:

```bash
deno --version
```

If the major version is 1.x, upgrade Deno:

```bash
deno upgrade
```

Or use the recommended `curl | bash` binary install instead, which requires no Deno.

### nsyte init hangs or prompts unexpectedly

- Ensure you are running in an interactive terminal (not piped or redirected).
- For non-interactive environments (CI/CD), skip `nsyte init` and supply all config via
  CLI flags when running `nsyte deploy`. See the `nsyte-deploy` skill.
