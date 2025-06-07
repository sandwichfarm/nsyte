# AUR Package for nsyte

This directory contains the files needed to maintain the nsyte package in the Arch User Repository (AUR).

## Files

- `PKGBUILD` - The main build script for Arch Linux
- `.SRCINFO` - Generated metadata file (auto-generated from PKGBUILD)

## For Maintainers

### Updating the Package

1. Update `pkgver` in `PKGBUILD`
2. Update the source URL if needed
3. Calculate new SHA256 sum:
   ```bash
   curl -sL https://github.com/sandwichfarm/nsyte/archive/v[VERSION].tar.gz | sha256sum
   ```
4. Update `sha256sums` in `PKGBUILD`
5. Update `pkgrel` (reset to 1 for new versions, increment for same version)
6. Generate new `.SRCINFO`:
   ```bash
   makepkg --printsrcinfo > .SRCINFO
   ```
7. Test the package:
   ```bash
   makepkg -si
   ```

### Publishing to AUR

1. Clone the AUR repository:
   ```bash
   git clone ssh://aur@aur.archlinux.org/nsyte.git
   ```
2. Copy `PKGBUILD` and `.SRCINFO` to the cloned directory
3. Commit and push:
   ```bash
   git add PKGBUILD .SRCINFO
   git commit -m "Update to v0.7.0"
   git push
   ```

## One-line Installation

Once published to AUR, users can install with:

```bash
# Using yay
yay -S nsyte

# Using paru
paru -S nsyte

# Manual installation
git clone https://aur.archlinux.org/nsyte.git && cd nsyte && makepkg -si
```