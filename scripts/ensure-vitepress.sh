#!/bin/bash
set -euo pipefail

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
  elif command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
  else
    echo "pnpm is required to install docs dependencies" >&2
    exit 1
  fi
}

if [ -f "docs/pnpm-lock.yaml" ]; then
  run_pnpm --dir docs install --frozen-lockfile
  exit 0
fi

if [ -x "docs/node_modules/.bin/vitepress" ]; then
  exit 0
fi

echo "📦 Installing VitePress dependencies..."

if [ -f "docs/package-lock.json" ]; then
  npm ci --prefix docs
else
  run_pnpm --dir docs install
fi
