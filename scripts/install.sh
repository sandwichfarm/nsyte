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
            ;;
        Linux*)
            OS="linux"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            OS="windows"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            ;;
    esac
    
    print_info "Detected OS: $OS"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Get latest release info from GitHub
get_latest_release() {
    print_info "Fetching latest release information..."
    
    if command_exists curl; then
        LATEST_RELEASE=$(curl -s https://api.github.com/repos/$REPO/releases/latest)
    elif command_exists wget; then
        LATEST_RELEASE=$(wget -qO- https://api.github.com/repos/$REPO/releases/latest)
    else
        print_error "Neither curl nor wget found. Please install curl or wget and try again."
    fi
    
    VERSION=$(echo "$LATEST_RELEASE" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -z "$VERSION" ]; then
        print_error "Could not determine latest version. Please check your internet connection."
    fi
    
    print_info "Latest version: $VERSION"
}

# Download and install binary
install_binary() {
    # Determine binary name and install directory based on OS
    case "$OS" in
        macos)
            BINARY_URL="https://github.com/$REPO/releases/download/$VERSION/nsyte-macos"
            INSTALL_DIR="/usr/local/bin"
            ;;
        linux)
            BINARY_URL="https://github.com/$REPO/releases/download/$VERSION/nsyte-linux"
            INSTALL_DIR="/usr/local/bin"
            ;;
        windows)
            BINARY_URL="https://github.com/$REPO/releases/download/$VERSION/nsyte-windows.exe"
            BINARY_NAME="nsyte.exe"
            INSTALL_DIR="$HOME/bin"
            ;;
    esac
    
    print_info "Downloading nsyte binary..."
    
    # Create temp file
    TEMP_FILE=$(mktemp)
    
    # Download binary
    if command_exists curl; then
        curl -L -o "$TEMP_FILE" "$BINARY_URL" || print_error "Download failed"
    elif command_exists wget; then
        wget -O "$TEMP_FILE" "$BINARY_URL" || print_error "Download failed"
    fi
    
    # Make executable
    chmod +x "$TEMP_FILE"
    
    # Determine if we need sudo
    if [ "$OS" != "windows" ]; then
        if [ -w "$INSTALL_DIR" ]; then
            mv "$TEMP_FILE" "$INSTALL_DIR/$BINARY_NAME"
        else
            print_info "Administrator access required to install to $INSTALL_DIR"
            sudo mv "$TEMP_FILE" "$INSTALL_DIR/$BINARY_NAME"
        fi
    else
        # Windows
        mkdir -p "$INSTALL_DIR"
        mv "$TEMP_FILE" "$INSTALL_DIR/$BINARY_NAME"
    fi
    
    print_success "nsyte installed successfully to $INSTALL_DIR/$BINARY_NAME"
    
    # Add to PATH instructions for Windows
    if [ "$OS" = "windows" ]; then
        print_info "Add $INSTALL_DIR to your PATH to use nsyte from anywhere"
    fi
}

# Main installation logic
main() {
    echo "🚀 nsyte Install Script"
    echo "======================="
    echo ""
    
    detect_os
    get_latest_release
    install_binary
    
    echo ""
    print_success "Installation complete!"
    print_info "Run 'nsyte --version' to verify the installation"
    print_info "Run 'nsyte init' to get started"
}

# Run main function
main "$@"