#!/bin/bash
set -e

# nsyte Install Script - Downloads pre-compiled binaries

REPO="sandwichfarm/nsyte"
BINARY_NAME="nsyte"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Detect operating system
detect_os() {
    case "$(uname -s)" in
        Darwin*)
            OS="macos"
            ARCH="$(uname -m)"
            ;;
        Linux*)
            OS="linux"
            ARCH="$(uname -m)"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            OS="windows"
            ARCH="$(uname -m)"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            ;;
    esac
    
    # Normalize architecture
    case "$ARCH" in
        x86_64|amd64)
            ARCH="x86_64"
            ;;
        arm64|aarch64)
            ARCH="arm64"
            ;;
        *)
            print_warning "Architecture $ARCH may not be supported, trying x86_64"
            ARCH="x86_64"
            ;;
    esac
    
    print_info "Detected: $OS ($ARCH)"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install using Homebrew (macOS)
install_homebrew() {
    print_info "Installing nsyte using Homebrew..."
    
    # Add the tap if it doesn't exist
    if ! brew tap | grep -q "sandwichfarm/tap"; then
        print_info "Adding sandwichfarm/tap..."
        if ! brew tap sandwichfarm/tap; then
            print_warning "Failed to add tap, falling back to binary installation"
            return 1
        fi
    fi
    
    # Install nsyte from the tap
    if brew install sandwichfarm/tap/nsyte; then
        print_success "nsyte installed successfully via Homebrew!"
        return 0
    else
        print_warning "Homebrew installation failed, falling back to binary installation"
        return 1
    fi
}

# Install using Scoop (Windows)
install_scoop() {
    print_info "Installing nsyte using Scoop..."
    if scoop bucket list | grep -q "sandwichfarm"; then
        print_info "sandwichfarm bucket already added"
    else
        print_info "Adding sandwichfarm bucket..."
        scoop bucket add sandwichfarm https://github.com/sandwichfarm/scoop-bucket.git
    fi
    
    if scoop install nsyte; then
        print_success "nsyte installed successfully via Scoop!"
        return 0
    else
        print_warning "Scoop installation failed, falling back to binary installation"
        return 1
    fi
}

# Install using Chocolatey (Windows)
install_chocolatey() {
    print_info "Installing nsyte using Chocolatey..."
    if choco install nsyte -y; then
        print_success "nsyte installed successfully via Chocolatey!"
        return 0
    else
        print_warning "Chocolatey installation failed, falling back to binary installation"
        return 1
    fi
}

# Install using yay/AUR (Arch Linux)
install_aur() {
    print_info "Installing nsyte using AUR..."
    if yay -S nsyte --noconfirm; then
        print_success "nsyte installed successfully via AUR!"
        return 0
    else
        print_warning "AUR installation failed, falling back to binary installation"
        return 1
    fi
}

# Install using Deno
install_deno() {
    print_info "Installing nsyte using Deno..."
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    
    print_info "Cloning repository..."
    if git clone https://github.com/sandwichfarm/nsyte.git "$TEMP_DIR" >/dev/null 2>&1; then
        cd "$TEMP_DIR"
        print_info "Installing from local repository..."
        if deno install -A -f -g -n nsyte src/cli.ts; then
            cd - >/dev/null
            rm -rf "$TEMP_DIR"
            print_success "nsyte installed successfully via Deno!"
            return 0
        else
            cd - >/dev/null
            rm -rf "$TEMP_DIR"
            print_warning "Deno installation failed, falling back to binary installation"
            return 1
        fi
    else
        rm -rf "$TEMP_DIR"
        print_warning "Failed to clone repository, falling back to binary installation"
        return 1
    fi
}

# Get latest release info from GitHub
get_latest_release() {
    print_info "Fetching latest release information..."
    
    if command_exists curl; then
        LATEST_RELEASE=$(curl -s https://api.github.com/repos/$REPO/releases/latest)
    elif command_exists wget; then
        LATEST_RELEASE=$(wget -qO- https://api.github.com/repos/$REPO/releases/latest)
    else
        print_error "Neither curl nor wget found. Cannot download binary."
    fi
    
    VERSION=$(echo "$LATEST_RELEASE" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -z "$VERSION" ]; then
        print_error "Could not determine latest version"
    fi
    
    print_info "Latest version: $VERSION"
}

# Download and install binary
install_binary() {
    get_latest_release
    
    # Determine binary name based on OS
    case "$OS" in
        macos)
            BINARY_URL="https://github.com/$REPO/releases/download/$VERSION/nsyte-macos"
            ;;
        linux)
            BINARY_URL="https://github.com/$REPO/releases/download/$VERSION/nsyte-linux"
            ;;
        windows)
            BINARY_URL="https://github.com/$REPO/releases/download/$VERSION/nsyte-windows.exe"
            BINARY_NAME="nsyte.exe"
            INSTALL_DIR="$HOME/bin"
            ;;
    esac
    
    print_info "Downloading $BINARY_URL..."
    
    # Create install directory if it doesn't exist
    if [ "$OS" = "windows" ]; then
        mkdir -p "$INSTALL_DIR"
    else
        sudo mkdir -p "$INSTALL_DIR" 2>/dev/null || mkdir -p "$HOME/.local/bin"
        if [ ! -w "$INSTALL_DIR" ]; then
            INSTALL_DIR="$HOME/.local/bin"
            print_info "Using $INSTALL_DIR as install directory"
        fi
    fi
    
    # Download binary
    if command_exists curl; then
        curl -L -o "/tmp/$BINARY_NAME" "$BINARY_URL"
    elif command_exists wget; then
        wget -O "/tmp/$BINARY_NAME" "$BINARY_URL"
    else
        print_error "Neither curl nor wget found. Cannot download binary."
    fi
    
    # Make executable and move to install directory
    chmod +x "/tmp/$BINARY_NAME"
    
    if [ "$OS" = "windows" ]; then
        mv "/tmp/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
    else
        if [ -w "$INSTALL_DIR" ]; then
            mv "/tmp/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
        else
            sudo mv "/tmp/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
        fi
    fi
    
    print_success "nsyte binary installed to $INSTALL_DIR/$BINARY_NAME"
    
    # Add to PATH instructions
    if [ "$INSTALL_DIR" = "$HOME/.local/bin" ] || [ "$INSTALL_DIR" = "$HOME/bin" ]; then
        print_info "Make sure $INSTALL_DIR is in your PATH:"
        echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> ~/.bashrc
        echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> ~/.zshrc 2>/dev/null || true
        print_info "Restart your terminal or run: export PATH=\"$INSTALL_DIR:\$PATH\""
    fi
}

# Main installation logic
main() {
    echo "🚀 nsyte Universal Installer"
    echo "=============================="
    
    detect_os
    
    case "$OS" in
        macos)
            if command_exists brew; then
                install_homebrew && return 0
            fi
            if command_exists deno; then
                install_deno && return 0
            fi
            install_binary
            ;;
        linux)
            # Check for Arch Linux
            if [ -f /etc/arch-release ] && command_exists yay; then
                install_aur && return 0
            fi
            if command_exists deno; then
                install_deno && return 0
            fi
            install_binary
            ;;
        windows)
            if command_exists scoop; then
                install_scoop && return 0
            fi
            if command_exists choco; then
                install_chocolatey && return 0
            fi
            if command_exists deno; then
                install_deno && return 0
            fi
            install_binary
            ;;
    esac
    
    echo ""
    print_success "Installation complete!"
    print_info "Run 'nsyte --version' to verify the installation"
    print_info "Run 'nsyte init' to get started"
}

# Run main function
main "$@"