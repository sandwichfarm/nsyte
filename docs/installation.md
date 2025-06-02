---
title: Installation Guide
description: How to install nsyte on different platforms
---

# Installation Guide

nsyte can be installed in several ways depending on your platform and preferences. Choose the method that best suits your setup.

## Package Managers (Recommended)

### macOS

**Homebrew** (Recommended)
```bash
brew install sandwichfarm/tap/nsyte
```

### Windows

**Scoop** (Recommended)
```bash
scoop bucket add sandwichfarm https://github.com/sandwichfarm/scoop-bucket.git
scoop install nsyte
```

**Chocolatey**
```bash
choco install nsyte
```

### Linux

**Arch Linux (AUR)**
```bash
yay -S nsyte
```

**Debian/Ubuntu**
```bash
curl -fsSL https://github.com/sandwichfarm/nsyte/releases/download/v0.7.0/nsyte_0.7.0_amd64.deb -o nsyte.deb
sudo dpkg -i nsyte.deb
```

**Flatpak**
```bash
flatpak install flathub org.github.sandwichfarm.nsyte
```

**Snap**
```bash
sudo snap install nsyte
```

## Universal Installation

### Using Deno

If you have [Deno](https://deno.land/) installed (version 2.0 or later):

```bash
deno install -A -f -g -n nsyte https://raw.githubusercontent.com/sandwichfarm/nsyte/main/src/cli.ts
```

### Pre-built Binaries

Download binaries for your platform from the [Releases](https://github.com/sandwichfarm/nsyte/releases) page:

- Linux (x86_64)
- macOS (x86_64) 
- Windows (x86_64)

**Linux/macOS Installation:**
```bash
# Download and install
curl -L -o nsyte https://github.com/sandwichfarm/nsyte/releases/latest/download/nsyte-linux
chmod +x nsyte
sudo mv nsyte /usr/local/bin/
```

**Windows Installation:**
1. Download `nsyte-windows.exe`
2. Rename to `nsyte.exe`
3. Add to your system PATH

## Building from Source

For development or custom builds:

```bash
git clone https://github.com/sandwichfarm/nsyte.git
cd nsyte
deno task compile
```

## Verification

After installation, verify nsyte is working:

```bash
nsyte --version
nsyte init
```

## Next Steps

- [Initialize your first project](./usage/index.md)
- [Configure your deployment settings](./usage/configuration.md)  
- [Deploy your site](./guides/deployment.md) 