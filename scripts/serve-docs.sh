#!/bin/bash
set -euo pipefail

./scripts/ensure-vitepress.sh
exec ./node_modules/.bin/vitepress dev docs "$@"
