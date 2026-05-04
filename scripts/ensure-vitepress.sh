#!/bin/bash
set -euo pipefail

if [ -x "docs/node_modules/.bin/vitepress" ]; then
  exit 0
fi

echo "📦 Installing VitePress dependencies..."

if [ -f "docs/package-lock.json" ]; then
  npm ci --prefix docs
else
  npm install --prefix docs
fi
