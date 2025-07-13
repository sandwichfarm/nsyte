#!/bin/bash

# Example: Publishing releases with NIP-94 file metadata

# Example 1: Auto-create archive from uploaded files
echo "Example 1: Auto-creating release archive"
nsyte upload ./dist --publish-file-metadata --version v1.0.0

# Example 2: Use a single pre-made archive
echo "Example 2: Using pre-made archive"
nsyte upload ./dist --publish-file-metadata --version v1.1.0 \
  --release-artifacts releases/my-app-v1.1.0.tar.gz

# Example 3: Multiple platform-specific archives
echo "Example 3: Multi-platform release"
nsyte upload ./dist --publish-file-metadata --version v2.0.0 \
  --release-artifacts build/app-linux-x64.tar.gz,build/app-macos-arm64.zip,build/app-windows-x64.zip

# Example 4: Different archive formats
echo "Example 4: Mixed archive formats"
nsyte upload ./dist --publish-file-metadata --version latest \
  --release-artifacts dist.tar.gz,source.zip,docs.tar

# Example 5: CI/CD integration
echo "Example 5: CI/CD with version from git tag"
VERSION=$(git describe --tags --abbrev=0)
nsyte upload ./dist --publish-file-metadata --version "$VERSION" \
  --release-artifacts "artifacts/*.$VERSION.tar.gz"

# Example 6: Incremental release building
echo "Example 6: Building a release incrementally"
# First CI job builds Linux
nsyte upload ./dist --publish-file-metadata --version v3.0.0 \
  --release-artifacts build/app-linux.tar.gz

# Second CI job adds macOS (appends to existing release)
nsyte upload ./dist --publish-file-metadata --version v3.0.0 \
  --release-artifacts build/app-macos.zip

# Third CI job adds Windows (appends to existing release)
nsyte upload ./dist --publish-file-metadata --version v3.0.0 \
  --release-artifacts build/app-windows.zip

# Example 7: Updating a specific artifact
echo "Example 7: Replacing a specific artifact"
# Fix a bug in the Linux build and re-upload (replaces due to different hash)
nsyte upload ./dist --publish-file-metadata --version v3.0.0 \
  --release-artifacts build/app-linux.tar.gz