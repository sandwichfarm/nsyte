---
title: Installation Guide
description: How to install nsyte on different platforms
---

# Installation Guide

nsyte can be installed in several ways depending on your platform and preferences.

## Quick Install (Recommended)

The easiest way to install nsyte is using our universal install script that automatically detects
your system and uses the best available method:

```bash
curl -fsSL https://nsyte.run/get/install.sh | bash
```

Or with wget:

```bash
wget -qO- https://nsyte.run/get/install.sh | bash
```

The script will automatically:

- Detect your operating system (macOS, Linux, Windows)
- Check for available package managers (Homebrew, Scoop, Chocolatey, AUR, Deno)
- Install using the best available method
- Fall back to downloading the latest binary if no package managers are found

## Package Managers

### macOS

**Homebrew Installation**

Homebrew is the most popular package manager for macOS. If you have Homebrew installed, you can
install nsyte directly from our formula:

```bash
brew install https://raw.githubusercontent.com/sandwichfarm/homebrew-tap/main/Formula/nsyte.rb
```

This command will:

- Download the nsyte formula from our tap repository
- Install all required dependencies automatically
- Make nsyte available system-wide
- Allow easy updates with `brew upgrade`

To verify the installation:

```bash
nsyte --version
```

To update nsyte later:

```bash
brew upgrade nsyte
```

**Note**: This installation method requires GitHub authentication the first time. If you prefer to
avoid this, use the universal install script above.

### Windows

**Scoop Installation (Recommended)**

Scoop is a command-line installer for Windows that makes it easy to install and manage developer
tools. It's the recommended way to install nsyte on Windows.

First, add the sandwichfarm bucket to access nsyte:

```bash
scoop bucket add sandwichfarm https://github.com/sandwichfarm/scoop-bucket.git
```

Then install nsyte:

```bash
scoop install nsyte
```

Benefits of using Scoop:

- No admin privileges required
- Clean installation and uninstallation
- Easy updates with `scoop update nsyte`
- Automatic PATH management
- No UAC popups or GUI installers

To verify the installation:

```bash
nsyte --version
```

To update nsyte later:

```bash
scoop update nsyte
```

**Chocolatey Installation**

Chocolatey is another popular package manager for Windows. If you prefer Chocolatey or already have
it installed:

```bash
choco install nsyte
```

**Note**: Chocolatey installation requires administrator privileges. Run this command in an elevated
PowerShell or Command Prompt.

To verify the installation:

```bash
nsyte --version
```

To update nsyte later:

```bash
choco upgrade nsyte
```

### Linux

**Arch Linux (AUR)**

For Arch Linux and Arch-based distributions (Manjaro, EndeavourOS, etc.), nsyte is available in the
Arch User Repository (AUR).

Using yay (or any AUR helper):

```bash
yay -S nsyte
```

Or manually from AUR:

```bash
git clone https://aur.archlinux.org/nsyte.git
cd nsyte
makepkg -si
```

The AUR package:

- Automatically handles dependencies
- Integrates with pacman for easy management
- Provides systemd service files if needed
- Follows Arch packaging standards

To update nsyte later:

```bash
yay -Syu nsyte
```

**Debian/Ubuntu (.deb Package)**

For Debian, Ubuntu, and derivatives (Linux Mint, Pop!_OS, etc.), we provide pre-built .deb packages.

Download and install the latest release:

```bash
curl -fsSL https://github.com/sandwichfarm/nsyte/releases/download/v0.7.0/nsyte_0.7.0_amd64.deb -o nsyte.deb
sudo dpkg -i nsyte.deb
```

If you encounter dependency issues:

```bash
sudo apt-get install -f
```

The .deb package:

- Installs to `/usr/local/bin/nsyte`
- Includes man pages and documentation
- Registers with dpkg for clean uninstallation
- Compatible with apt for dependency resolution

To uninstall:

```bash
sudo dpkg -r nsyte
```

**Flatpak (Universal Linux Package)**

Flatpak provides a universal packaging format that works across all Linux distributions. It's ideal
if you want sandboxed applications or automatic updates.

Install from Flathub:

```bash
flatpak install flathub org.github.sandwichfarm.nsyte
```

Run nsyte via Flatpak:

```bash
flatpak run org.github.sandwichfarm.nsyte
```

Create an alias for convenience:

```bash
echo "alias nsyte='flatpak run org.github.sandwichfarm.nsyte'" >> ~/.bashrc
source ~/.bashrc
```

Benefits of Flatpak:

- Works on any Linux distribution
- Automatic updates through Flatpak
- Sandboxed for additional security
- No dependency conflicts
- Easy rollback to previous versions

To update:

```bash
flatpak update org.github.sandwichfarm.nsyte
```

**Snap Package**

Snap is another universal package format, particularly popular on Ubuntu and its derivatives.

Install from the Snap Store:

```bash
sudo snap install nsyte
```

The Snap package:

- Auto-updates in the background
- Confined by default for security
- Works across many Linux distributions
- Includes all dependencies

To manually update:

```bash
sudo snap refresh nsyte
```

To view available versions:

```bash
snap info nsyte
```

## Universal Installation

### Using Deno

Deno is a modern JavaScript/TypeScript runtime that provides a secure and simple way to run nsyte.
This method works on any platform where Deno is installed.

**Prerequisites**: [Deno](https://deno.land/) version 2.0 or later

**Install from JSR (recommended):**

```bash
deno install -A -f -g -n nsyte jsr:@nsyte/cli
```

**Install from GitHub source:**

```bash
deno install -A -f -g -n nsyte jsr:@nsyte/cli
```

Command breakdown:

- `-A`: Grant all permissions (nsyte needs file system and network access)
- `-f`: Force overwrite if nsyte is already installed
- `-g`: Install globally
- `-n nsyte`: Name the command `nsyte`

Benefits of Deno installation:

- Always runs the latest version from source
- Cross-platform compatibility
- No compilation needed
- Easy to modify or fork
- Secure by default with explicit permissions

To update to the latest version:

```bash
# From JSR
deno install -A -f -g -n nsyte jsr:@nsyte/cli

# From GitHub
deno install -A -f -g -n nsyte jsr:@nsyte/cli
```

To install a specific version:

```bash
# From JSR
deno install -A -f -g -n nsyte jsr:@nsyte/cli@0.10.1

# From GitHub
deno install -A -f -g -n nsyte https://raw.githubusercontent.com/sandwichfarm/nsyte/v0.7.0/src/cli.ts
```

### Pre-built Binaries

For users who prefer manual installation or need specific versions, we provide pre-compiled binaries
for all major platforms.

Download binaries from the [Releases](https://github.com/sandwichfarm/nsyte/releases) page:

Available platforms:

- **Linux**: x86_64 (Intel/AMD 64-bit)
- **macOS**: x86_64 (Intel), arm64 (Apple Silicon)
- **Windows**: x86_64 (64-bit)

**Linux/macOS Manual Installation**

1. Download the appropriate binary for your system:

```bash
# For Linux (example)
curl -L -o nsyte https://github.com/sandwichfarm/nsyte/releases/latest/download/nsyte-linux

# For macOS Intel
curl -L -o nsyte https://github.com/sandwichfarm/nsyte/releases/latest/download/nsyte-macos

# For macOS Apple Silicon
curl -L -o nsyte https://github.com/sandwichfarm/nsyte/releases/latest/download/nsyte-macos-arm64
```

2. Make the binary executable:

```bash
chmod +x nsyte
```

3. Move to a directory in your PATH:

```bash
# System-wide installation (requires sudo)
sudo mv nsyte /usr/local/bin/

# Or user-local installation
mkdir -p ~/.local/bin
mv nsyte ~/.local/bin/
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

4. Verify the installation:

```bash
nsyte --version
```

**Windows Manual Installation**

1. Download `nsyte-windows.exe` from the
   [releases page](https://github.com/sandwichfarm/nsyte/releases)

2. Rename the file:
   - Rename `nsyte-windows.exe` to `nsyte.exe`

3. Choose installation location:
   - **Option A**: System-wide (requires admin)
     - Move to `C:\Program Files\nsyte\`
     - Add `C:\Program Files\nsyte` to system PATH

   - **Option B**: User installation
     - Create folder `%USERPROFILE%\bin`
     - Move `nsyte.exe` to this folder
     - Add `%USERPROFILE%\bin` to user PATH

4. Add to PATH (Windows 10/11):
   - Open Settings → System → About → Advanced system settings
   - Click "Environment Variables"
   - Under "User variables" or "System variables", find "Path"
   - Click "Edit" → "New"
   - Add your chosen installation directory
   - Click "OK" to save

5. Verify installation (open new Command Prompt):

```cmd
nsyte --version
```

## Building from Source

If you want to contribute to nsyte, need custom modifications, or want to build from the latest
development version, you can compile nsyte from source.

**Prerequisites**:

- [Deno](https://deno.land/) 2.0 or later
- Git
- Basic familiarity with command line

**Build Instructions**:

1. Clone the repository:

```bash
git clone https://github.com/sandwichfarm/nsyte.git
cd nsyte
```

2. Install development dependencies (if any):

```bash
# nsyte uses Deno, so no npm install needed!
```

3. Build for your current platform:

```bash
deno task compile
```

This creates a binary in the project directory named:

- `nsyte` (Linux/macOS)
- `nsyte.exe` (Windows)

4. Build for all platforms:

```bash
deno task compile:all
```

This creates binaries for all supported platforms in the `dist/` directory.

5. Install locally:

```bash
# Linux/macOS
sudo cp nsyte /usr/local/bin/

# Or install to user directory
mkdir -p ~/.local/bin
cp nsyte ~/.local/bin/
```

**Development Workflow**:

For development, you can run nsyte directly without compiling:

```bash
deno run -A src/cli.ts --help
```

Run tests:

```bash
deno task test
```

Format code:

```bash
deno fmt
```

Lint code:

```bash
deno lint
```

## Verification and Troubleshooting

### Verify Installation

After installation, verify nsyte is working correctly:

```bash
# Check version
nsyte --version

# View help
nsyte --help

# Initialize a test project
nsyte init
```

### Common Issues and Solutions

**Command not found**

- Ensure the installation directory is in your PATH
- Restart your terminal or reload your shell configuration
- For user installations, check `~/.local/bin` is in PATH

**Permission denied**

- Linux/macOS: Ensure the binary has execute permissions: `chmod +x $(which nsyte)`
- Windows: Run as administrator if installed system-wide

**Version mismatch**

- Multiple installations may exist, check with:
  ```bash
  # Linux/macOS
  which -a nsyte

  # Windows
  where nsyte
  ```
- Remove old installations before installing new ones

**Network issues during installation**

- Check your internet connection
- Try using a different installation method
- For corporate networks, check proxy settings

**Missing dependencies**

- Deno installation requires network access to download modules
- Package manager installations handle dependencies automatically
- Binary installations have no external dependencies

### Getting Help

If you encounter issues:

1. Check the [troubleshooting guide](./guides/troubleshooting.md)
2. Search [existing issues](https://github.com/sandwichfarm/nsyte/issues)
3. Join our [community chat](https://njump.me/npub1...)
4. Open a [new issue](https://github.com/sandwichfarm/nsyte/issues/new) with:
   - Your operating system and version
   - Installation method used
   - Complete error messages
   - Steps to reproduce

## Next Steps

Now that nsyte is installed, you're ready to start publishing to the decentralized web:

- **[Quick Start Guide](./usage/index.md)** - Initialize and deploy your first site
- **[Configuration Options](./usage/configuration.md)** - Customize nsyte for your needs
- **[Deployment Strategies](./guides/deployment.md)** - Learn best practices for production
  deployments
- **[CI/CD Integration](./guides/ci-cd.md)** - Automate your deployments
