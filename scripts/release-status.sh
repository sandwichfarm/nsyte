#!/bin/bash

# Script to check release workflow status
# Usage: ./scripts/release-status.sh

set -e

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "   Install it with: brew install gh"
    exit 1
fi

echo "📊 Recent Release Workflow Runs:"
echo ""

# List recent runs
gh run list --workflow="Build and Release" --limit 5

echo ""
echo "To view details of a specific run:"
echo "   gh run view [RUN_ID]"
echo ""
echo "To watch a run in progress:"
echo "   gh run watch [RUN_ID]"
echo ""
echo "To download artifacts from a run:"
echo "   gh run download [RUN_ID]"