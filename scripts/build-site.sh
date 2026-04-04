#!/bin/bash
set -e

echo "🚀 Building nsyte website..."

# Create dist directory
mkdir -p dist

# Copy splash page to root
echo "📄 Copying splash page..."
cp website/src/index.html dist/

# Copy website static files (including .well-known)
echo "📁 Copying website static files..."
if [ -d "website/static" ]; then
  cp -r website/static/. dist/
fi

# Copy JSON Schema files
echo "📋 Copying schema files..."
mkdir -p dist/schemas
cp src/schemas/config.schema.json dist/schemas/config.schema.json

# Copy demo recording files
echo "🎬 Copying demo files..."
cp -r static/demo dist/

# Copy install script to a subdirectory to avoid root-level restrictions
echo "📦 Preparing install script..."
mkdir -p dist/get
cp scripts/install.sh dist/get/install.sh
cp scripts/install.sh dist/get/install.txt
# Copy install.txt at root (Bunny.net blocks .sh files at root)
cp scripts/install.sh dist/install.txt
# Add redirect for legacy install URL
cp website/src/install-redirect.html dist/install.html

# Build documentation with MkDocs
echo "📚 Building documentation..."

# Check if the virtual environment exists, if not, set it up
if [ ! -f ".venv/docs/bin/mkdocs" ]; then
  echo "📦 Setting up documentation environment..."
  if [ -f "scripts/setup-docs.sh" ]; then
    bash scripts/setup-docs.sh
  else
    echo "❌ Error: scripts/setup-docs.sh not found"
    exit 1
  fi
fi

.venv/docs/bin/mkdocs build

echo "Do brotli and gz compression"
node scripts/compress-site-files.js

echo "✅ Website built successfully!"
echo ""
echo "Structure:"
echo "  dist/"
echo "  ├── index.html          (splash page)"
echo "  ├── .well-known/        (nostr.json and other well-known files)"
echo "  ├── schemas/            (JSON Schema files)"
echo "  ├── demo/               (asciinema demos)"
echo "  ├── install.sh          (install script)"
echo "  └── docs/               (documentation)"
echo ""
echo "🌐 Open dist/index.html to view the site"