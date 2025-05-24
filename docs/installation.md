---
title: Installation Guide
description: How to install nsyte on different platforms
---

# Installation Guide

nsyte can be installed in several ways depending on your needs and platform. Choose the method that best suits your requirements.

## Using Deno (Recommended)

If you have [Deno](https://deno.land/) installed (version 2.0 or later), you can install nsyte using the following command:

```bash
deno install -A -f -g -n nsyte https://raw.githubusercontent.com/sandwichfarm/nsyte/main/src/cli.ts
```

This will:
1. Download the latest version of nsyte
2. Install it globally on your system
3. Make the `nsyte` command available in your terminal

To verify the installation:
```bash
nsyte --version
```

## Pre-built Binaries

For users who prefer not to install Deno, pre-built binaries are available for:

- Linux (x86_64)
- macOS (x86_64)
- Windows (x86_64)

Download the appropriate binary from the [Releases](https://github.com/sandwichfarm/nsyte/releases) page.

### Linux/macOS Installation

```bash
# Download the binary
curl -L -o nsyte https://github.com/sandwichfarm/nsyte/releases/latest/download/nsyte-linux

# Make it executable
chmod +x nsyte

# Move to a directory in your PATH
sudo mv nsyte /usr/local/bin/
```

### Windows Installation

1. Download the `nsyte-windows.exe` file
2. Rename it to `nsyte.exe`
3. Add the directory containing the executable to your system's PATH

## Building from Source

If you need to build nsyte yourself (for example, for a different architecture), follow these steps:

1. Clone the repository:
```bash
git clone https://github.com/sandwichfarm/nsyte.git
cd nsyte
```

2. Build for your current platform:
```bash
deno task compile
```

Or build for all platforms:
```bash
deno task compile:all
```

The compiled binaries will be available in the `dist` directory.

## Requirements

- For Deno installation: Deno 2.0 or later
- For pre-built binaries: No additional requirements
- For building from source: Deno 2.0 or later

## Next Steps

After installation, you can:
1. [Initialize your first project](./usage/index.md#initializing-a-project)
2. [Configure your deployment settings](./usage/configuration.md)
3. [Start deploying your site](./guides/deployment.md) 