#!/bin/bash

# Script to trigger a release using GitHub CLI
# Usage: ./scripts/release.sh [version] [--draft]

set -e

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "   Install it with: brew install gh"
    echo "   Then authenticate: gh auth login"
    exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI."
    echo "   Run: gh auth login"
    exit 1
fi

# Get version from argument or prompt
VERSION=${1:-}
if [ -z "$VERSION" ]; then
    read -p "Enter version number (e.g., 1.0.0): " VERSION
fi

# Remove v prefix if present
VERSION=${VERSION#v}

# Check if --draft flag is present
DRAFT="false"
if [[ "$2" == "--draft" ]] || [[ "$1" == "--draft" ]]; then
    DRAFT="true"
fi

echo "🚀 Triggering release workflow for v${VERSION}"
echo "   Draft: ${DRAFT}"
echo ""

# Trigger the workflow
gh workflow run "Build and Release" \
    -f version="${VERSION}" \
    -f draft="${DRAFT}"

echo "✅ Workflow triggered!"
echo ""
echo "📊 Monitor progress at:"
echo "   $(gh repo view --json url -q .url)/actions"
echo ""
echo "Or check status with:"
echo "   gh run list --workflow='Build and Release'"