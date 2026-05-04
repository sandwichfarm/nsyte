#!/bin/bash
set -euo pipefail

./scripts/ensure-vitepress.sh
exec ./docs/node_modules/.bin/vitepress dev docs "$@"
