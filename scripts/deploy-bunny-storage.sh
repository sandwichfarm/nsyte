#!/usr/bin/env bash
set -euo pipefail

directory="${1:-dist}"
endpoint="${BUNNY_STORAGE_ENDPOINT:-https://storage.bunnycdn.com}"
zone="${BUNNY_STORAGE_ZONE:-nsyte}"

: "${BUNNY_STORAGE_PASSWORD:?BUNNY_STORAGE_PASSWORD is required}"

if [[ ! -d "$directory" ]]; then
  echo "Directory not found: $directory" >&2
  exit 1
fi

endpoint="${endpoint%/}"

files=()
while IFS= read -r -d "" file; do
  files+=("$file")
done < <(find "$directory" -type f -print0 | sort -z)

if (( ${#files[@]} == 0 )); then
  echo "No files found in $directory" >&2
  exit 1
fi

echo "Uploading ${#files[@]} files from $directory to Bunny storage zone $zone"

upload_file() {
  local file="$1"
  local remote_path="${file#"$directory"/}"
  local url="$endpoint/$zone/$remote_path"

  echo "Uploading $remote_path"

  if [[ "${DRY_RUN:-}" == "1" ]]; then
    return 0
  fi

  curl --fail --show-error --silent \
    --connect-timeout 20 \
    --max-time 120 \
    --retry 8 \
    --retry-all-errors \
    --retry-delay 2 \
    --retry-max-time 600 \
    --request PUT \
    --header "AccessKey: $BUNNY_STORAGE_PASSWORD" \
    --header "Content-Type: application/octet-stream" \
    --data-binary "@$file" \
    "$url" >/dev/null
}

for file in "${files[@]}"; do
  upload_file "$file"
done

echo "Bunny storage upload complete"
