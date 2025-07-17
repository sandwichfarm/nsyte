# NIP-94/NIP-82 Quick Reference

## Command Line Options

```bash
--publish-file-metadata    # Enable NIP-94 release artifacts
--version <version>        # Required: Set version (e.g., v1.0.0, latest)
--release-artifacts <paths># Optional: Use existing archives (comma-separated)
```

## Configuration

```json
{
  "publishFileMetadata": true,
  "application": {
    "id": "com.example.app",
    "summary": "Short description",
    "repository": "https://github.com/example/app",
    "platforms": ["web", "linux", "windows"],
    "license": "MIT"
  }
}
```

## Basic Usage

### Auto-create Archive
```bash
nsyte deploy ./dist --publish-file-metadata --version v1.0.0
```

### Use Existing Archives
```bash
nsyte deploy ./dist --publish-file-metadata --version v1.0.0 \
  --release-artifacts dist.tar.gz,dist.zip
```

### Multiple Platform Builds
```bash
# First build
nsyte deploy ./dist --publish-file-metadata --version v2.0.0 \
  --release-artifacts linux.tar.gz

# Second build (appends)
nsyte deploy ./dist --publish-file-metadata --version v2.0.0 \
  --release-artifacts windows.zip

# Third build (appends)
nsyte deploy ./dist --publish-file-metadata --version v2.0.0 \
  --release-artifacts macos.tar.gz
```

## Smart Behavior

| Scenario | Action |
|----------|--------|
| Same filename, same hash | Skip (already exists) |
| Same filename, different hash | Replace artifact |
| New filename | Append to release |
| No existing release | Create new release |

## Event Structure

### NIP-82 Software Application (kind 32267)
- `d`: Application ID (e.g., com.example.app)
- `name`: Application name
- `f`: Platform tags (web, linux, windows, etc.)
- `repository`: Source code URL
- `license`: SPDX license ID

### NIP-94 File Metadata (kind 1063)
- `url`: Blossom server URL
- `m`: MIME type
- `x`: SHA-256 hash
- `size`: File size in bytes
- `f`: Platform tags (auto-detected)

### NIP-51 Release Set (kind 30063)
- `d`: project-name@version
- `e`: References to NIP-94 events
- `a`: Reference to NIP-82 application
- `version`: Version string
- `content`: Release notes

## CI/CD Example

```yaml
- name: Release
  run: |
    VERSION=$(git describe --tags --abbrev=0)
    nsyte deploy dist \
      --publish-file-metadata \
      --version "$VERSION" \
      --release-artifacts "build/*.tar.gz"
```

## Tips

1. **Version Format**: Any string is valid (v1.0.0, latest, nightly, etc.)
2. **Incremental Builds**: Multiple CI jobs can contribute to one release
3. **Replacement**: Upload same filename with new content to update
4. **Compatibility**: Works with any NIP-94/NIP-51 compliant tool