---
title: Installation Guide
description: How to install nsyte on different platforms
---

# Installation Guide

nsyte can be installed in several ways depending on your platform and preferences.

## Quick Install (Recommended)

The easiest way to install nsyte is using the install script. It downloads the appropriate
pre-compiled binary from the GitHub releases page for your platform and architecture.

::: code-group

```bash [curl]
curl -fsSL https://nsyte.run/get/install.sh | bash
```

```bash [wget]
wget -qO- https://nsyte.run/get/install.sh | bash
```

:::

The script will:

- Detect your operating system (macOS, Linux, Windows) and CPU architecture
- Download the matching pre-compiled binary from the latest GitHub release
- Place the binary in a directory on your PATH (`/usr/local/bin` on Linux/macOS by default)
- Verify the binary runs

The script does not use Homebrew, apt, dnf, pacman, AUR helpers, Scoop, or Chocolatey. It always
uses the direct binary download path. Package-manager installs are available separately where noted
below.

## Package Managers

### Homebrew

```bash
brew tap sandwichfarm/nsyte https://github.com/sandwichfarm/homebrew-nsyte
brew install nsyte
```

### Scoop

```powershell
scoop bucket add nsyte https://github.com/sandwichfarm/scoop-nsyte
scoop install nsyte
```

### AUR

```bash
yay -S nsyte
yay -S nsyte-bin
```

`nsite-git` is prepared for AUR but is not public until the first authenticated AUR push is
completed.

## Universal Installation

### Using Deno

Deno is a modern JavaScript/TypeScript runtime that provides a secure and simple way to run nsyte.
This method works on any platform where Deno is installed.

**Prerequisites**: [Deno](https://deno.land/) version 2.0 or later

**Install from JSR (recommended):**

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
deno install -A -f -g -n nsyte jsr:@nsyte/cli
```

Re-running the install command always pulls the latest published JSR release.

To install a specific version:

```bash
# From JSR — replace the version with the desired tag
deno install -A -f -g -n nsyte jsr:@nsyte/cli@0.26.0
```

See [JSR releases](https://jsr.io/@nsyte/cli/versions) for the list of published versions.

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
# For Linux (x86_64)
curl -L -o nsyte https://github.com/sandwichfarm/nsyte/releases/latest/download/nsyte-linux

# For macOS Intel (x86_64)
curl -L -o nsyte https://github.com/sandwichfarm/nsyte/releases/latest/download/nsyte-macos-x64

# For macOS Apple Silicon (arm64)
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

- Deno installation requires network access to download the JSR package
- Pre-compiled binary installations have no external dependencies

### Getting Help

If you encounter issues:

1. Check the [security troubleshooting guide](./guides/security-troubleshooting.md)
2. Search [existing issues](https://github.com/sandwichfarm/nsyte/issues)
3. Open a [new issue](https://github.com/sandwichfarm/nsyte/issues/new) with:
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
