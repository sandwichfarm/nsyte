#!/bin/bash
set -euo pipefail

if [ -x "node_modules/.bin/vitepress" ]; then
  exit 0
fi

echo "📦 Installing VitePress dependencies..."

if [ -f "package-lock.json" ]; then
  npm ci
else
  npm install
fi
