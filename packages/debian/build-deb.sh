#!/bin/bash
set -e

# Build a Debian package for nsyte from a published Linux release asset.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="${VERSION:?Set VERSION to the release version, for example VERSION=1.6.0}"
SHA256="${SHA256:-}"
PACKAGE_DIR="$SCRIPT_DIR/nsyte_${VERSION}_amd64"
BINARY_PATH="$PROJECT_ROOT/dist/nsyte-linux-${VERSION}"
RELEASE_URL="https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-linux-${VERSION}"

echo "Building nsyte Debian package v$VERSION..."

# Clean up any existing build
rm -rf "$PACKAGE_DIR"

# Create package directory structure
mkdir -p "$PACKAGE_DIR/DEBIAN"
mkdir -p "$PACKAGE_DIR/usr/bin"
mkdir -p "$PACKAGE_DIR/usr/share/doc/nsyte"

# Copy control files
cp "$SCRIPT_DIR/DEBIAN/control" "$PACKAGE_DIR/DEBIAN/"
cp "$SCRIPT_DIR/DEBIAN/postinst" "$PACKAGE_DIR/DEBIAN/"
cp "$SCRIPT_DIR/DEBIAN/prerm" "$PACKAGE_DIR/DEBIAN/"

# Make control scripts executable
chmod 755 "$PACKAGE_DIR/DEBIAN/postinst"
chmod 755 "$PACKAGE_DIR/DEBIAN/prerm"

# Fetch the release binary when it is not already present locally.
if [ ! -f "$BINARY_PATH" ]; then
    mkdir -p "$PROJECT_ROOT/dist"
    curl -fsSL "$RELEASE_URL" -o "$BINARY_PATH"
fi

if [ -n "$SHA256" ]; then
    echo "${SHA256}  ${BINARY_PATH}" | sha256sum -c -
fi

cp "$BINARY_PATH" "$PACKAGE_DIR/usr/bin/nsyte"
chmod 755 "$PACKAGE_DIR/usr/bin/nsyte"

# Copy documentation
cp "$PROJECT_ROOT/README.md" "$PACKAGE_DIR/usr/share/doc/nsyte/"
cp "$PROJECT_ROOT/LICENSE" "$PACKAGE_DIR/usr/share/doc/nsyte/"

# Create copyright file
cat > "$PACKAGE_DIR/usr/share/doc/nsyte/copyright" << EOF
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: nsyte
Upstream-Contact: sandwichfarm <noreply@github.com>
Source: https://github.com/sandwichfarm/nsyte

Files: *
Copyright: 2024 sandwichfarm
License: MIT
 The MIT License (MIT)
 .
 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:
 .
 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.
 .
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
EOF

# Build the package
echo "Building .deb package..."
cd "$SCRIPT_DIR"
dpkg-deb --build "nsyte_${VERSION}_amd64"

echo "Package built: nsyte_${VERSION}_amd64.deb"
echo ""
echo "To install locally:"
echo "  sudo dpkg -i nsyte_${VERSION}_amd64.deb"
echo ""
echo "To upload to PPA or repository, additional steps are needed."
