# NIP-94 CI/CD Integration Guide

This guide shows how to use nsyte's NIP-94 release artifacts feature in various CI/CD environments.

## GitHub Actions

### Basic Release Workflow

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Linux artifact
        run: |
          npm run build
          tar -czf dist-linux.tar.gz dist/
      
      - name: Publish Linux build
        run: |
          nsyte deploy dist \
            --publish-file-metadata \
            --version ${{ github.ref_name }} \
            --release-artifacts dist-linux.tar.gz \
            --privatekey ${{ secrets.NOSTR_PRIVATE_KEY }} \
            --relays ${{ vars.NOSTR_RELAYS }} \
            --servers ${{ vars.BLOSSOM_SERVERS }}

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Windows artifact
        run: |
          npm run build
          Compress-Archive -Path dist/* -DestinationPath dist-windows.zip
      
      - name: Publish Windows build
        run: |
          nsyte deploy dist `
            --publish-file-metadata `
            --version ${{ github.ref_name }} `
            --release-artifacts dist-windows.zip `
            --privatekey ${{ secrets.NOSTR_PRIVATE_KEY }} `
            --relays ${{ vars.NOSTR_RELAYS }} `
            --servers ${{ vars.BLOSSOM_SERVERS }}
```

### Matrix Build Strategy

```yaml
name: Matrix Release

on:
  release:
    types: [created]

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            artifact: dist-linux-x64.tar.gz
            build: tar -czf dist-linux-x64.tar.gz dist/
          - os: macos-latest
            artifact: dist-macos-arm64.tar.gz
            build: tar -czf dist-macos-arm64.tar.gz dist/
          - os: windows-latest
            artifact: dist-windows-x64.zip
            build: Compress-Archive -Path dist/* -DestinationPath dist-windows-x64.zip
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Build
        run: |
          npm ci
          npm run build
          ${{ matrix.build }}
      
      - name: Publish artifact
        run: |
          nsyte deploy dist \
            --publish-file-metadata \
            --version ${{ github.event.release.tag_name }} \
            --release-artifacts ${{ matrix.artifact }} \
            --non-interactive \
            --privatekey ${{ secrets.NOSTR_PRIVATE_KEY }}
```

## GitLab CI

```yaml
stages:
  - build
  - release

variables:
  VERSION: ${CI_COMMIT_TAG}

.release_template: &release_definition
  stage: release
  script:
    - nsyte deploy dist
        --publish-file-metadata
        --version $VERSION
        --release-artifacts $ARTIFACT_PATH
        --privatekey $NOSTR_PRIVATE_KEY
        --relays $NOSTR_RELAYS
        --servers $BLOSSOM_SERVERS
  only:
    - tags

build:linux:
  stage: build
  script:
    - npm ci
    - npm run build
    - tar -czf dist-linux.tar.gz dist/
  artifacts:
    paths:
      - dist-linux.tar.gz

release:linux:
  <<: *release_definition
  needs: ["build:linux"]
  variables:
    ARTIFACT_PATH: dist-linux.tar.gz

build:windows:
  stage: build
  tags:
    - windows
  script:
    - npm ci
    - npm run build
    - tar -czf dist-windows.tar.gz dist/
  artifacts:
    paths:
      - dist-windows.tar.gz

release:windows:
  <<: *release_definition
  needs: ["build:windows"]
  variables:
    ARTIFACT_PATH: dist-windows.tar.gz
```

## Jenkins Pipeline

```groovy
pipeline {
    agent none
    
    parameters {
        string(name: 'VERSION', defaultValue: '', description: 'Release version')
    }
    
    stages {
        stage('Build & Release') {
            parallel {
                stage('Linux') {
                    agent { label 'linux' }
                    steps {
                        sh 'npm ci && npm run build'
                        sh 'tar -czf dist-linux.tar.gz dist/'
                        sh """
                            nsyte deploy dist \
                                --publish-file-metadata \
                                --version ${params.VERSION} \
                                --release-artifacts dist-linux.tar.gz \
                                --privatekey \$NOSTR_PRIVATE_KEY
                        """
                    }
                }
                
                stage('macOS') {
                    agent { label 'macos' }
                    steps {
                        sh 'npm ci && npm run build'
                        sh 'tar -czf dist-macos.tar.gz dist/'
                        sh """
                            nsyte deploy dist \
                                --publish-file-metadata \
                                --version ${params.VERSION} \
                                --release-artifacts dist-macos.tar.gz \
                                --privatekey \$NOSTR_PRIVATE_KEY
                        """
                    }
                }
                
                stage('Windows') {
                    agent { label 'windows' }
                    steps {
                        bat 'npm ci && npm run build'
                        powershell 'Compress-Archive -Path dist/* -DestinationPath dist-windows.zip'
                        bat """
                            nsyte deploy dist ^
                                --publish-file-metadata ^
                                --version ${params.VERSION} ^
                                --release-artifacts dist-windows.zip ^
                                --privatekey %NOSTR_PRIVATE_KEY%
                        """
                    }
                }
            }
        }
    }
}
```

## Best Practices

### 1. Version Management

Use git tags for consistent versioning:

```bash
# In your CI script
VERSION=$(git describe --tags --abbrev=0)
nsyte deploy --version "$VERSION" ...
```

### 2. Secure Key Management

Never hardcode private keys. Use your CI/CD platform's secret management:

- **GitHub Actions**: Use repository secrets
- **GitLab CI**: Use protected variables
- **Jenkins**: Use credentials plugin
- **CircleCI**: Use context variables

### 3. Artifact Naming Convention

Use descriptive names that include platform and architecture:

```bash
# Good examples
app-linux-x64.tar.gz
app-macos-arm64.tar.gz
app-windows-x64.zip
app-source-v1.0.0.tar.gz

# Include version in filename for clarity
app-${VERSION}-linux-x64.tar.gz
```

### 4. Incremental Releases

Take advantage of nsyte's append capability:

```yaml
# Job 1: Build and release Linux
- name: Release Linux
  run: |
    nsyte deploy --version v1.0.0 --release-artifacts linux.tar.gz

# Job 2: Build and release Windows (runs later)
- name: Release Windows
  run: |
    nsyte deploy --version v1.0.0 --release-artifacts windows.zip
    # Automatically appends to existing v1.0.0 release
```

### 5. Error Handling

Always check for failures and implement retries:

```bash
#!/bin/bash
set -e  # Exit on error

# Function to upload with retries
upload_with_retry() {
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo "Upload attempt $attempt of $max_attempts"
        
        if nsyte deploy dist \
            --publish-file-metadata \
            --version "$VERSION" \
            --release-artifacts "$1" \
            --non-interactive; then
            echo "Upload successful"
            return 0
        fi
        
        echo "Upload failed, retrying..."
        attempt=$((attempt + 1))
        sleep 5
    done
    
    echo "Upload failed after $max_attempts attempts"
    return 1
}

# Use the function
upload_with_retry "dist-linux.tar.gz"
```

### 6. Multi-Architecture Builds

Use build matrices for comprehensive coverage:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    arch: [x64, arm64]
    exclude:
      - os: windows-latest
        arch: arm64  # Not supported
```

### 7. Release Notes

Include meaningful release notes:

```bash
# Generate release notes from git log
RELEASE_NOTES=$(git log --pretty=format:"- %s" $(git describe --tags --abbrev=0 HEAD^)..HEAD)

# Create a release notes file
echo "$RELEASE_NOTES" > release-notes.txt

# Include in your release
nsyte deploy dist \
    --publish-file-metadata \
    --version "$VERSION" \
    --release-artifacts dist.tar.gz,release-notes.txt
```

## Troubleshooting

### Release Already Exists

If you see "All artifacts already exist in the release", it means:
- The exact same file (same hash) is already in the release
- This is normal for idempotent CI/CD runs
- No action needed

### Replacing Artifacts

When updating a release with a fixed artifact:
- nsyte automatically detects files with the same name but different content
- The old artifact is replaced with the new one
- Other artifacts in the release remain unchanged

### Debugging

Enable verbose output for troubleshooting:

```bash
nsyte deploy dist \
    --publish-file-metadata \
    --version v1.0.0 \
    --release-artifacts dist.tar.gz \
    --verbose
```

Check the logs for:
- "Archive X already exists with same hash. Skipping." - Duplicate detection
- "Archive X has different hash. Will replace existing artifact." - Replacement
- "Appending N artifact(s) to release" - Adding new artifacts