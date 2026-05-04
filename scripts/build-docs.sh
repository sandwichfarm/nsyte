#!/bin/bash
set -euo pipefail

./scripts/ensure-vitepress.sh
./docs/node_modules/.bin/vitepress build docs
node scripts/prepare-vitepress-directory-urls.mjs
