# NIP-94/NIP-82 Release Artifacts

nsyte supports publishing release artifacts using:
- **NIP-94** (File Metadata) - Individual file/archive metadata
- **NIP-51** (Lists) - Grouping releases
- **NIP-82** (Software Applications) - Application metadata and platform information

This allows you to create versioned releases of your nsite with full application metadata, platform detection, and compatibility information that can be discovered and downloaded by other tools and users.

## Overview

When enabled, nsyte will:

1. Either create a tar.gz archive of your uploaded files OR use your pre-made archives
2. Upload the archive(s) to your configured Blossom servers
3. Publish NIP-94 file metadata events (kind 1063) for each archive
4. Create or update a NIP-51 release artifact set (kind 30063) that references all artifacts

## Key Features

- **Flexible Archive Sources**: Auto-create archives or use existing ones
- **Smart Release Management**: Automatically append, replace, or skip artifacts
- **Platform Detection**: Automatically detects target platforms from file names
- **Application Metadata**: Full NIP-82 support for comprehensive app descriptions
- **Multi-Tool Compatibility**: Works with releases created by other NIP-94/NIP-51 tools
- **Incremental Building**: Build releases across multiple CI/CD runs
- **Duplicate Detection**: Skip uploading identical artifacts
- **Automatic Replacement**: Update artifacts with the same name but different content

## Configuration

Add the `publishFileMetadata` option and optional `application` metadata to your `.nsite/config.json`:

```json
{
  "publishFileMetadata": true,
  "application": {
    "id": "com.example.myapp",
    "summary": "A decentralized web application",
    "icon": "https://example.com/icon.png",
    "repository": "https://github.com/example/myapp",
    "platforms": ["web", "linux", "windows", "macos"],
    "license": "MIT"
  },
  // ... other configuration
}
```

## Usage

When uploading with file metadata enabled, you must provide a version:

```bash
# Upload with a specific version
nsyte upload --version v1.0.0

# Or use any version tag
nsyte upload --version latest
nsyte upload --version nightly
nsyte upload --version v2.1.0-beta
```

### Command Line Options

- `--publish-file-metadata`: Enable NIP-94 file metadata publishing for this upload
- `--version <version>`: Required when file metadata is enabled. Sets the version tag for the release
- `--release-artifacts <paths>`: Comma-separated paths to existing archives (tar.gz, zip) to publish instead of creating one

### Examples

#### Automatic Archive Creation

```bash
# Upload your site and automatically create release artifacts
nsyte upload --publish-file-metadata --version v1.0.0

# This will:
# 1. Upload your files normally
# 2. Create a tar.gz archive of all files
# 3. Upload the archive to Blossom servers
# 4. Publish NIP-94 event with file metadata
# 5. Create NIP-51 release artifact set with d-tag "yourproject@v1.0.0"
```

#### Using Pre-made Archives

```bash
# Upload your site with existing release archives
nsyte upload --publish-file-metadata --version v2.0.0 --release-artifacts dist.tar.gz,dist.zip

# This will:
# 1. Upload your files normally
# 2. Upload the provided archives (dist.tar.gz and dist.zip) to Blossom servers
# 3. Publish NIP-94 events for each archive
# 4. Create NIP-51 release artifact set referencing both archives
```

#### Multiple Platform Releases

```bash
# Upload platform-specific builds
nsyte upload --publish-file-metadata --version v1.5.0 \
  --release-artifacts build/app-linux.tar.gz,build/app-macos.zip,build/app-windows.zip

# Creates a single release with multiple platform-specific artifacts
```

## Event Structure

### NIP-82 Software Application Event (kind 32267)

```json
{
  "kind": 32267,
  "tags": [
    ["d", "com.example.myapp"],
    ["name", "My Application"],
    ["summary", "A decentralized web application"],
    ["icon", "https://example.com/icon.png"],
    ["url", "https://myapp.example.com"],
    ["repository", "https://github.com/example/myapp"],
    ["f", "web"],
    ["f", "linux"],
    ["f", "windows"],
    ["f", "macos"],
    ["license", "MIT"],
    ["client", "nsyte"]
  ],
  "content": "Full description of the application with markdown support"
}
```

### NIP-94 File Metadata Event (kind 1063)

```json
{
  "kind": 1063,
  "tags": [
    ["url", "https://cdn.example.com/<sha256>"],
    ["m", "application/gzip"],
    ["x", "<sha256-hash>"],
    ["size", "1234567"],
    ["f", "linux"],  // Platform tags (auto-detected or configured)
    ["client", "nsyte"]
  ],
  "content": "Release v1.0.0 - app-linux.tar.gz"
}
```

### NIP-51 Release Artifact Set (kind 30063)

```json
{
  "kind": 30063,
  "tags": [
    ["d", "my-project@v1.0.0"],
    ["e", "<nip94-event-id>"],
    ["version", "v1.0.0"],
    ["a", "32267:<pubkey>:com.example.myapp"],  // Reference to application
    ["client", "nsyte"]
  ],
  "content": "My Project release v1.0.0"
}
```

## Use Cases

- **Versioned Deployments**: Keep track of different versions of your site
- **Backup and Recovery**: Download previous versions of your site
- **Distribution**: Share your site as a downloadable archive
- **Multi-Platform Releases**: Publish platform-specific builds in a single release
- **Integration**: Other tools can discover and use your releases

## Smart Release Management

nsyte intelligently manages release artifacts:

- **Append Mode**: If a release already exists, new artifacts are automatically appended to it
- **Duplicate Detection**: Artifacts with the same filename and hash are skipped
- **Automatic Replacement**: Artifacts with the same filename but different hash replace the old version
- **Interoperability**: Works with releases created by other NIP-94/NIP-51 compatible tools

### Example Workflow

```bash
# Initial release with one artifact
nsyte upload --publish-file-metadata --version v1.0.0 --release-artifacts linux.tar.gz

# Add Windows build to the same release (appends)
nsyte upload --publish-file-metadata --version v1.0.0 --release-artifacts windows.zip

# Update Linux build with a fix (replaces due to different hash)
nsyte upload --publish-file-metadata --version v1.0.0 --release-artifacts linux.tar.gz

# Final release contains: updated linux.tar.gz + windows.zip
```

## Platform Detection

nsyte automatically detects platforms from file names:

- **Linux**: Files containing "linux", "ubuntu", "debian", or architecture names
- **Windows**: Files containing "windows", "win32", "win64", or ".exe"
- **macOS**: Files containing "macos", "darwin", "osx", or ".dmg"
- **Android**: Files containing "android", ".apk", or ".aab"
- **iOS**: Files containing "ios" or ".ipa"
- **Web**: Default when no platform is detected

You can override detection by configuring platforms in your application metadata.

## Notes

- When creating archives automatically, all files after `.nsiteignore` processing are included
- When using `--release-artifacts`, the specified files must exist and be readable
- Supported archive formats: .tar.gz, .tgz, .zip, .tar
- The d-tag format is `<project-name>@<version>` (e.g., "my-app@v1.2.3")
- Multiple archives can be associated with a single release version
- Releases can be incrementally built by multiple tools or CI/CD runs
- Application metadata (kind 32267) is published once and referenced by all releases
- Platform tags are automatically added to file metadata events for better discoverability