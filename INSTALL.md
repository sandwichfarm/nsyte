# nsyte Installation Guide

This guide provides one-line installation commands for nsyte on all major platforms.

## Supported Platforms

### macOS & Linux

**Homebrew:**
```bash
brew install sandwichfarm/tap/nsyte
```

### Windows

**Scoop (Recommended):**
```bash
scoop bucket add sandwichfarm https://github.com/sandwichfarm/scoop-bucket.git && scoop install nsyte
```

**Chocolatey:**
```bash
choco install nsyte
```

### Linux Distributions

**Arch Linux (AUR):**
```bash
# Using yay
yay -S nsyte

# Using paru  
paru -S nsyte
```

**Debian/Ubuntu:**
```bash
curl -fsSL https://github.com/sandwichfarm/nsyte/releases/download/v0.7.0/nsyte_0.7.0_amd64.deb -o nsyte.deb && sudo dpkg -i nsyte.deb
```

**Universal Linux (Snap):**
```bash
sudo snap install nsyte
```

**Universal Linux (Flatpak):**
```bash
flatpak install flathub org.github.sandwichfarm.nsyte
```

### Universal Methods

**Deno (All Platforms):**
```bash
deno install -A -f -g -n nsyte jsr:@nsyte/cli
```

**Pre-built Binaries:**
Download the appropriate binary for your platform from the [Releases page](https://github.com/sandwichfarm/nsyte/releases).

## Package Status

| Platform | Status | Repository |
|----------|---------|------------|
| Homebrew | ✅ Ready | [sandwichfarm/homebrew-tap](https://github.com/sandwichfarm/homebrew-tap) |
| Scoop | ✅ Ready | [sandwichfarm/scoop-bucket](https://github.com/sandwichfarm/scoop-bucket) |
| Chocolatey | 🚧 Pending | [chocolatey.org](https://chocolatey.org/) |
| AUR | 🚧 Pending | [aur.archlinux.org](https://aur.archlinux.org/) |
| Snap Store | 🚧 Pending | [snapcraft.io](https://snapcraft.io/) |
| Flathub | 🚧 Pending | [flathub.org](https://flathub.org/) |
| Debian PPA | 🚧 Pending | Custom PPA |

## Verification

After installation, verify nsyte is working:

```bash
nsyte --version
```

## Getting Started

Once installed, initialize your first project:

```bash
nsyte init
```

## Support

For installation issues:
- Check the [Issues page](https://github.com/sandwichfarm/nsyte/issues)
- Verify your platform is supported
- Ensure you have the required permissions for package installation

## Contributing

Help us add support for more package managers! See our [packaging directory](./packaging/) for examples and contribution guidelines.