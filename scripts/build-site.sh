#!/bin/bash
set -e

echo "🚀 Building nsyte website..."

# Create dist directory
mkdir -p dist

# Copy splash page to root
echo "📄 Copying splash page..."
cp index.html dist/

# Copy demo recording files
echo "🎬 Copying demo files..."
cp -r demo-recording dist/

# Copy install script to a subdirectory to avoid root-level restrictions
echo "📦 Preparing install script..."
mkdir -p dist/get
cp install.sh dist/get/install.sh
cp install.sh dist/get/install.txt
# Copy install.txt at root (Bunny.net blocks .sh files at root)
cp install.sh dist/install.txt
# Add redirect for legacy install URL
cp install-redirect.html dist/install.html

# Build documentation with MkDocs
echo "📚 Building documentation..."
.venv/docs/bin/mkdocs build

echo "✅ Website built successfully!"
echo ""
echo "Structure:"
echo "  dist/"
echo "  ├── index.html          (splash page)"
echo "  ├── demo-recording/     (asciinema demos)"
echo "  ├── install.sh           (install script)"
echo "  └── docs/               (documentation)"
echo ""
echo "🌐 Open dist/index.html to view the site"