#!/bin/bash
set -e

# Script to build Debian package for nsyte

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="0.7.0"
PACKAGE_DIR="$SCRIPT_DIR/nsyte_${VERSION}_amd64"

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

# Copy the binary (you need to build it first)
if [ ! -f "$PROJECT_ROOT/dist/nsyte-linux" ]; then
    echo "Building nsyte binary..."
    cd "$PROJECT_ROOT"
    deno task compile:linux
fi

cp "$PROJECT_ROOT/dist/nsyte-linux" "$PACKAGE_DIR/usr/bin/nsyte"
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