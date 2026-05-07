# Flatpak Package for nsyte

This directory contains the manifest for building a Flatpak package of nsyte.

## Files

- `org.github.sandwichfarm.nsyte.yaml` - Flatpak manifest
- `README.md` - This file

## Building

To build the Flatpak package locally:

```bash
# Install flatpak-builder if not already installed
sudo apt install flatpak-builder

# Add Flathub repository if not already added
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo

# Install the required runtime and SDK
flatpak install flathub org.freedesktop.Platform//23.08 org.freedesktop.Sdk//23.08

# Build the package
flatpak-builder build-dir org.github.sandwichfarm.nsyte.yaml --force-clean

# Install locally
flatpak-builder --install build-dir org.github.sandwichfarm.nsyte.yaml --force-clean
```

## Publishing to Flathub

To publish to Flathub:

1. Fork the [Flathub repository](https://github.com/flathub/flathub)
2. Create a new repository for the app: `https://github.com/flathub/org.github.sandwichfarm.nsyte`
3. Submit the manifest to the new repository
4. Open a pull request to add the app to Flathub

## One-line Installation

Once published to Flathub, users can install with:

```bash
flatpak install flathub org.github.sandwichfarm.nsyte
```

## Running

After installation:

```bash
flatpak run org.github.sandwichfarm.nsyte
```

Or if installed system-wide, simply:

```bash
nsyte
```