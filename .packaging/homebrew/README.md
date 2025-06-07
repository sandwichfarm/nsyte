# Homebrew Formula for nsyte

This directory contains the Homebrew formula for nsyte.

## For Maintainers

### Updating the Formula

1. Update the version and URL in `nsyte.rb`
2. Calculate the new SHA256:
   ```bash
   curl -sL https://github.com/sandwichfarm/nsyte/archive/v[VERSION].tar.gz | shasum -a 256
   ```
3. Update the sha256 field in the formula
4. Test locally:
   ```bash
   brew install --build-from-source ./nsyte.rb
   brew test nsyte
   ```

### Publishing to Homebrew

This formula should be submitted to homebrew-core or maintained in a tap:

```bash
# For a custom tap (recommended initially)
brew tap sandwichfarm/nsyte
brew install nsyte
```

## One-line Installation

Once published, users can install with:

```bash
# From homebrew-core (future)
brew install nsyte

# From custom tap
brew tap sandwichfarm/nsyte && brew install nsyte
```