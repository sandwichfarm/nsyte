#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/prepare-aur-packages.sh <version> [--clone] [--push]

Examples:
  scripts/prepare-aur-packages.sh 0.27.1
  scripts/prepare-aur-packages.sh 0.27.1 --clone
  scripts/prepare-aur-packages.sh 0.27.1 --clone --push

Environment:
  OUTPUT_DIR  Directory for generated package worktrees.
              Default: /tmp/nsyte-aur-<version>

Notes:
  --clone clones ssh://aur@aur.archlinux.org/<package>.git into OUTPUT_DIR.
  --push requires --clone and pushes committed PKGBUILD/.SRCINFO changes to AUR.
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

VERSION="$1"
shift

CLONE=false
PUSH=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clone)
      CLONE=true
      ;;
    --push)
      PUSH=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ "$PUSH" == true && "$CLONE" != true ]]; then
  echo "--push requires --clone" >&2
  exit 1
fi

for command in curl sha256sum makepkg git; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/nsyte-aur-${VERSION}}"

SOURCE_URL="https://github.com/sandwichfarm/nsyte/archive/refs/tags/v${VERSION}.tar.gz"
LINUX_URL="https://github.com/sandwichfarm/nsyte/releases/download/v${VERSION}/nsyte-linux-${VERSION}"

echo "Computing release checksums for v${VERSION}..."
SHA256_SOURCE="$(curl -fsSL "$SOURCE_URL" | sha256sum | awk '{print $1}')"
SHA256_X86_64="$(curl -fsSL "$LINUX_URL" | sha256sum | awk '{print $1}')"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

for package in nsyte nsyte-bin nsite-git; do
  repo="${OUTPUT_DIR}/${package}"

  if [[ "$CLONE" == true ]]; then
    git clone "ssh://aur@aur.archlinux.org/${package}.git" "$repo"
    git -C "$repo" checkout -B master
  else
    mkdir -p "$repo"
  fi

  cp "${ROOT_DIR}/packages/aur/${package}/PKGBUILD" "${repo}/PKGBUILD"
  sed -i "s/PLACEHOLDER_VERSION/${VERSION}/g" "${repo}/PKGBUILD"

  case "$package" in
    nsyte)
      sed -i "s/PLACEHOLDER_SHA256_SOURCE/${SHA256_SOURCE}/g" "${repo}/PKGBUILD"
      ;;
    nsyte-bin)
      sed -i "s/PLACEHOLDER_SHA256_X86_64/${SHA256_X86_64}/g" "${repo}/PKGBUILD"
      ;;
  esac

  if grep -q "PLACEHOLDER_" "${repo}/PKGBUILD"; then
    echo "${package}: PKGBUILD still contains placeholders" >&2
    grep "PLACEHOLDER_" "${repo}/PKGBUILD" >&2
    exit 1
  fi

  (cd "$repo" && makepkg --printsrcinfo > .SRCINFO)
  test -s "${repo}/.SRCINFO"

  if command -v namcap >/dev/null 2>&1; then
    (cd "$repo" && namcap PKGBUILD)
  fi

  if [[ "$CLONE" == true ]]; then
    git -C "$repo" add PKGBUILD .SRCINFO
    if git -C "$repo" diff --cached --quiet; then
      echo "${package}: already up to date"
    else
      git -C "$repo" commit -m "chore: update ${package} to v${VERSION}"
      if [[ "$PUSH" == true ]]; then
        git -C "$repo" push origin master
      fi
    fi
  fi

  echo "Prepared ${package} in ${repo}"
done

echo "AUR package workdirs ready in ${OUTPUT_DIR}"
