# Phase 20: Packaging Infrastructure and Templates - Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 7 new files (PKGBUILD, Homebrew formula, Scoop manifest, 3 Winget YAMLs, flake.nix)
**Analogs found:** 7 / 7 (all files have partial or role-match analogs in `.packaging/`)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/aur/PKGBUILD` | config (package manifest) | batch/transform | `.packaging/aur/PKGBUILD` | role-match (same format, different packaging strategy: source-build vs binary) |
| `packages/homebrew/Formula/nsyte.rb` | config (package manifest) | batch/transform | `.packaging/homebrew/nsyte.rb` | role-match (same format, different approach: source vs prebuilt binary) |
| `packages/scoop/bucket/nsyte.json` | config (package manifest) | batch/transform | `.packaging/scoop/nsyte.json` | role-match (same format, partial schema differences) |
| `packages/winget/sandwichfarm.nsyte.version.yaml` | config (package manifest) | batch/transform | none in `.packaging/` | no analog |
| `packages/winget/sandwichfarm.nsyte.installer.yaml` | config (package manifest) | batch/transform | none in `.packaging/` | no analog |
| `packages/winget/sandwichfarm.nsyte.locale.en-US.yaml` | config (package manifest) | batch/transform | none in `.packaging/` | no analog |
| `flake.nix` | config (package manifest) | batch/transform | none in `.packaging/` | no analog |

---

## Pattern Assignments

### `packages/aur/PKGBUILD` (config, batch/transform)

**Analog:** `.packaging/aur/PKGBUILD` (lines 1-30)

**Key differences from analog:** The existing PKGBUILD is a source-build package (not `-bin`), compiles from tarball using `makedepends=('deno')`. The new file must be a `-bin` package that fetches pre-built binaries directly from GitHub releases. The old file has a single `source=()` array; the new file uses architecture-specific `source_x86_64=()` and `source_aarch64=()` arrays.

**Reuse from analog — maintainer header and metadata block** (lines 1-9):
```bash
# Maintainer: sandwichfarm <sandwich.farm@protonmail.com>
pkgname=nsyte-bin
pkgver=PLACEHOLDER_VERSION
pkgrel=1
pkgdesc="Publish your site to nostr and blossom servers"
arch=('x86_64' 'aarch64')
url="https://github.com/sandwichfarm/nsyte"
license=('MIT')
```

**Reuse from analog — placeholder convention** (line 13):
The existing `.packaging/aur/PKGBUILD` already uses `PLACEHOLDER_SHA256` as the literal string. The new file extends this to per-arch variants: `PLACEHOLDER_SHA256_X86_64` and `PLACEHOLDER_SHA256_AARCH64`.

**Diverge from analog — source arrays:** Replace the single `source=()` + `sha256sums=()` with per-arch pairs. Replace `makedepends=('deno')` + `build()` function with `provides=('nsyte')` + `conflicts=('nsyte')`. Replace the `install -Dm644 LICENSE` approach with an inline heredoc for the license (since the binary download contains no LICENSE file).

**Full new pattern** (derived from RESEARCH.md goreleaser-bin verified example):
```bash
# Maintainer: sandwichfarm <sandwich.farm@protonmail.com>

pkgname=nsyte-bin
pkgver=PLACEHOLDER_VERSION
pkgrel=1
pkgdesc="Publish your site to nostr and blossom servers"
arch=('x86_64' 'aarch64')
url="https://github.com/sandwichfarm/nsyte"
license=('MIT')
provides=('nsyte')
conflicts=('nsyte')

source_x86_64=(
  "nsyte-linux-${pkgver}::https://github.com/sandwichfarm/nsyte/releases/download/v${pkgver}/nsyte-linux-${pkgver}"
)
sha256sums_x86_64=('PLACEHOLDER_SHA256_X86_64')

# NOTE: aarch64 Linux binary requires release.yml to include an aarch64 build step (not yet present).
source_aarch64=(
  "nsyte-linux-aarch64-${pkgver}::https://github.com/sandwichfarm/nsyte/releases/download/v${pkgver}/nsyte-linux-aarch64-${pkgver}"
)
sha256sums_aarch64=('PLACEHOLDER_SHA256_AARCH64')

package() {
  case "$CARCH" in
    x86_64)  install -Dm755 "nsyte-linux-${pkgver}" "${pkgdir}/usr/bin/nsyte" ;;
    aarch64) install -Dm755 "nsyte-linux-aarch64-${pkgver}" "${pkgdir}/usr/bin/nsyte" ;;
  esac
  install -Dm644 /dev/stdin "${pkgdir}/usr/share/licenses/${pkgname}/LICENSE" <<LICENSE
MIT License — see https://github.com/sandwichfarm/nsyte/blob/main/LICENSE
LICENSE
}
```

**Version source:** `deno.json` line 3: `"version": "0.26.1"` — this is the bare semver without `v` prefix that `pkgver` will hold.

**Asset naming from release.yml** (lines 82-83, 152-153):
- Linux x86_64: `nsyte-linux-${{ env.VERSION }}` — matches `nsyte-linux-${pkgver}` in PKGBUILD
- Linux aarch64: `nsyte-linux-aarch64-${pkgver}` — forward-looking, not yet in release.yml

---

### `packages/homebrew/Formula/nsyte.rb` (config, batch/transform)

**Analog:** `.packaging/homebrew/nsyte.rb` (lines 1-32)

**Key differences from analog:** The existing formula is source-based (downloads tarball, builds with `deno task compile`, has `depends_on "deno"`). The new file must be prebuilt-binary based: per-platform `on_macos do` / `on_linux do` / `on_arm do` / `on_intel do` blocks, no `depends_on`, no `bottle do`, no `build()` system call.

**Reuse from analog — class name, desc, homepage, license, test block** (lines 1-5, 28-30):
```ruby
class Nsyte < Formula
  desc "Publish your site to nostr and blossom servers"
  homepage "https://github.com/sandwichfarm/nsyte"
  license "MIT"
  ...
  test do
    assert_match version.to_s, shell_output("#{bin}/nsyte --version")
  end
end
```

**Reuse from analog — placeholder string style** (line 5):
The existing file uses `sha256 "PLACEHOLDER_SHA256"`. The new file extends this to per-platform named placeholders.

**Diverge from analog:** Replace single `url` + `sha256` + `depends_on "deno"` + `def install` with system call → per-platform `on_*` blocks + `version` field at top + binary rename in `def install`.

**Critical detail from RESEARCH.md:** Bare executables (no archive extension) land in the build directory with their URL basename. The `def install` block must reference the per-platform filename and rename to `nsyte`.

**Full new pattern:**
```ruby
class Nsyte < Formula
  desc "Publish your site to nostr and blossom servers"
  homepage "https://github.com/sandwichfarm/nsyte"
  license "MIT"
  version "PLACEHOLDER_VERSION"

  on_macos do
    on_arm do
      url "https://github.com/sandwichfarm/nsyte/releases/download/v#{version}/nsyte-macos-arm64-#{version}"
      sha256 "PLACEHOLDER_SHA256_MACOS_ARM64"
    end
    on_intel do
      url "https://github.com/sandwichfarm/nsyte/releases/download/v#{version}/nsyte-macos-x64-#{version}"
      sha256 "PLACEHOLDER_SHA256_MACOS_X64"
    end
  end

  on_linux do
    url "https://github.com/sandwichfarm/nsyte/releases/download/v#{version}/nsyte-linux-#{version}"
    sha256 "PLACEHOLDER_SHA256_LINUX_X86_64"
  end

  def install
    if OS.mac? && Hardware::CPU.arm?
      bin.install "nsyte-macos-arm64-#{version}" => "nsyte"
    elsif OS.mac?
      bin.install "nsyte-macos-x64-#{version}" => "nsyte"
    else
      bin.install "nsyte-linux-#{version}" => "nsyte"
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/nsyte --version")
  end
end
```

**Asset naming from release.yml** (lines 153, 227, 82):
- macOS arm64: `nsyte-macos-arm64-${{ env.VERSION }}` → `nsyte-macos-arm64-#{version}`
- macOS x64: `nsyte-macos-x64-${{ env.VERSION }}` → `nsyte-macos-x64-#{version}`
- Linux x86_64: `nsyte-linux-${{ env.VERSION }}` → `nsyte-linux-#{version}`

---

### `packages/scoop/bucket/nsyte.json` (config, batch/transform)

**Analog:** `.packaging/scoop/nsyte.json` (lines 1-23)

**Key differences from analog:**
- Old file uses `"architecture": { "64bit": { "url": ..., "hash": ... } }` nested structure — outdated Scoop schema
- Old file references `nsyte-windows.exe` (unversioned) — new file must reference `nsyte-windows-PLACEHOLDER_VERSION.exe` (versioned)
- Old file `autoupdate` lacks a `hash` section — new file must include `autoupdate.hash` with `"mode": "download"`
- Old file `bin` value is `"nsyte-windows.exe"` — the `#/nsyte.exe` URL fragment rename convention should be used instead

**Reuse from analog — `checkver` and `description`, `homepage`, `license`** (lines 2-4, 13-15):
```json
"description": "...",
"homepage": "https://github.com/sandwichfarm/nsyte",
"license": "MIT",
"checkver": {
  "github": "https://github.com/sandwichfarm/nsyte"
}
```

**Reuse from analog — placeholder string** (line 10):
Existing file uses `"PLACEHOLDER_SHA256"`. New file uses `"PLACEHOLDER_SHA256_WINDOWS"` for disambiguation.

**Full new pattern** (flat structure per current Scoop schema):
```json
{
  "version": "PLACEHOLDER_VERSION",
  "description": "Publish your site to nostr and blossom servers",
  "homepage": "https://github.com/sandwichfarm/nsyte",
  "license": "MIT",
  "url": "https://github.com/sandwichfarm/nsyte/releases/download/vPLACEHOLDER_VERSION/nsyte-windows-PLACEHOLDER_VERSION.exe#/nsyte.exe",
  "hash": "PLACEHOLDER_SHA256_WINDOWS",
  "bin": "nsyte.exe",
  "checkver": {
    "github": "https://github.com/sandwichfarm/nsyte"
  },
  "autoupdate": {
    "url": "https://github.com/sandwichfarm/nsyte/releases/download/v$version/nsyte-windows-$version.exe#/nsyte.exe",
    "hash": {
      "url": "https://github.com/sandwichfarm/nsyte/releases/download/v$version/nsyte-windows-$version.exe",
      "mode": "download"
    }
  }
}
```

**Version rule:** `"version"` field uses bare semver (no `v`). The `v` appears only in the download URL path. Source: RESEARCH.md "Version stripping" note and existing `.packaging/scoop/nsyte.json` line 2 (`"0.7.0"` not `"v0.7.0"`).

**Asset naming from release.yml** (lines 305-306):
- Windows: `nsyte-windows-${{ env.VERSION }}.exe` → `nsyte-windows-PLACEHOLDER_VERSION.exe`

---

### `packages/winget/sandwichfarm.nsyte.version.yaml` (config, batch/transform)

**Analog:** None — no winget manifests in `.packaging/` directory.

**Pattern source:** RESEARCH.md verified templates (ManifestVersion 1.12.0, Microsoft Learn March 2026).

**Full pattern:**
```yaml
PackageIdentifier: "sandwichfarm.nsyte"
PackageVersion: "PLACEHOLDER_VERSION"
DefaultLocale: "en-US"
ManifestType: "version"
ManifestVersion: "1.12.0"
```

**Placeholder rule:** `PackageVersion` uses bare semver. Re-verify `ManifestVersion` against `microsoft/winget-pkgs` schema before Phase 25 PR submission.

---

### `packages/winget/sandwichfarm.nsyte.installer.yaml` (config, batch/transform)

**Analog:** None — no winget manifests in `.packaging/` directory.

**Pattern source:** RESEARCH.md verified templates.

**Full pattern:**
```yaml
PackageIdentifier: "sandwichfarm.nsyte"
PackageVersion: "PLACEHOLDER_VERSION"
InstallerType: "portable"
Installers:
  - Architecture: "x64"
    InstallerUrl: "https://github.com/sandwichfarm/nsyte/releases/download/vPLACEHOLDER_VERSION/nsyte-windows-PLACEHOLDER_VERSION.exe"
    InstallerSha256: "PLACEHOLDER_SHA256_WINDOWS"
ManifestType: "installer"
ManifestVersion: "1.12.0"
```

**Hash format rule:** `InstallerSha256` must be a 64-character lowercase hex SHA256 string with no prefix (not SRI format). Compute with `sha256sum file | awk '{print $1}'`.

**Asset naming from release.yml** (line 305): `nsyte-windows-${{ env.VERSION }}.exe` → `nsyte-windows-PLACEHOLDER_VERSION.exe`

---

### `packages/winget/sandwichfarm.nsyte.locale.en-US.yaml` (config, batch/transform)

**Analog:** None — no winget manifests in `.packaging/` directory.

**Pattern source:** RESEARCH.md verified templates.

**Full pattern:**
```yaml
PackageIdentifier: "sandwichfarm.nsyte"
PackageVersion: "PLACEHOLDER_VERSION"
PackageLocale: "en-US"
Publisher: "Sandwich Farm LLC"
PublisherUrl: "https://github.com/sandwichfarm"
PackageName: "nsyte"
PackageUrl: "https://github.com/sandwichfarm/nsyte"
License: "MIT"
LicenseUrl: "https://github.com/sandwichfarm/nsyte/blob/main/LICENSE"
ShortDescription: "Publish your site to nostr and blossom servers"
Tags:
  - "nostr"
  - "blossom"
  - "cli"
  - "decentralized"
ManifestType: "defaultLocale"
ManifestVersion: "1.12.0"
```

**Publisher name:** `"Sandwich Farm LLC"` — consistent with maintainer email `sandwich.farm@protonmail.com` in PKGBUILD analog.

---

### `flake.nix` (config, batch/transform)

**Analog:** None — no Nix files exist anywhere in the nsyte codebase.

**Pattern source:** RESEARCH.md verified templates (nixpkgs bun/package.nix pattern for `autoPatchelfHook` Linux-conditional, NixOS Wiki Packaging/Binaries).

**Critical constraints from RESEARCH.md:**
- Linux binaries from `deno compile` are dynamically linked ELF — `autoPatchelfHook` is REQUIRED on Linux
- Darwin binaries are Mach-O — `autoPatchelfHook` must NOT be applied to Darwin
- Nix hashes use SRI format: `"sha256-<base64>="` — not hex
- `dontUnpack = true` required because release assets are bare executables, not archives

**autoPatchelfHook conditional pattern** (from nixpkgs bun derivation, cited in RESEARCH.md):
```nix
nativeBuildInputs = pkgs.lib.optionals isLinux [
  pkgs.autoPatchelfHook
];

buildInputs = pkgs.lib.optionals isLinux [
  pkgs.glibc
];
```

**Full new pattern:**
```nix
{
  description = "nsyte — publish your site to nostr and blossom servers";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      version = "PLACEHOLDER_VERSION";

      sources = {
        "x86_64-linux" = {
          url = "https://github.com/sandwichfarm/nsyte/releases/download/v${version}/nsyte-linux-${version}";
          hash = "sha256-PLACEHOLDER_HASH_X86_64_LINUX=";
        };
        # NOTE: aarch64-linux binary requires release.yml aarch64 build step (not yet present).
        "aarch64-linux" = {
          url = "https://github.com/sandwichfarm/nsyte/releases/download/v${version}/nsyte-linux-aarch64-${version}";
          hash = "sha256-PLACEHOLDER_HASH_AARCH64_LINUX=";
        };
        "x86_64-darwin" = {
          url = "https://github.com/sandwichfarm/nsyte/releases/download/v${version}/nsyte-macos-x64-${version}";
          hash = "sha256-PLACEHOLDER_HASH_X86_64_DARWIN=";
        };
        "aarch64-darwin" = {
          url = "https://github.com/sandwichfarm/nsyte/releases/download/v${version}/nsyte-macos-arm64-${version}";
          hash = "sha256-PLACEHOLDER_HASH_AARCH64_DARWIN=";
        };
      };

      supportedSystems = builtins.attrNames sources;
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          src = sources.${system};
          isLinux = pkgs.stdenvNoCC.isLinux;
        in
        {
          nsyte = pkgs.stdenvNoCC.mkDerivation {
            pname = "nsyte";
            inherit version;

            src = pkgs.fetchurl {
              inherit (src) url hash;
            };

            nativeBuildInputs = pkgs.lib.optionals isLinux [
              pkgs.autoPatchelfHook
            ];

            buildInputs = pkgs.lib.optionals isLinux [
              pkgs.glibc
            ];

            dontUnpack = true;
            dontBuild = true;

            installPhase = ''
              install -m755 -D $src $out/bin/nsyte
            '';

            meta = with pkgs.lib; {
              description = "Publish your site to nostr and blossom servers";
              homepage = "https://github.com/sandwichfarm/nsyte";
              license = licenses.mit;
              platforms = supportedSystems;
              mainProgram = "nsyte";
            };
          };

          default = self.packages.${system}.nsyte;
        });
    };
}
```

**SRI placeholder convention:** `"sha256-PLACEHOLDER_HASH_<SYSTEM>="` retains the `sha256-` prefix and `=` suffix so the structural shape is identifiable. CI replaces the entire quoted string.

**Asset naming from release.yml:**
- Linux x86_64 (lines 82-83): `nsyte-linux-${{ env.VERSION }}` → `nsyte-linux-${version}`
- macOS arm64 (lines 227-228): `nsyte-macos-arm64-${{ env.VERSION }}` → `nsyte-macos-arm64-${version}`
- macOS x64 (lines 152-153): `nsyte-macos-x64-${{ env.VERSION }}` → `nsyte-macos-x64-${version}`

---

## Shared Patterns

### Placeholder Convention
**Apply to:** All 7 files
**Pattern:** Use `PLACEHOLDER_` prefix with an architecture/platform suffix to make `sed` substitution unambiguous.

| Placeholder String | Used In |
|---|---|
| `PLACEHOLDER_VERSION` | All files — the bare semver without `v` (e.g., `0.26.1`) |
| `PLACEHOLDER_SHA256_X86_64` | PKGBUILD `sha256sums_x86_64` |
| `PLACEHOLDER_SHA256_AARCH64` | PKGBUILD `sha256sums_aarch64` |
| `PLACEHOLDER_SHA256_MACOS_ARM64` | Homebrew formula `on_arm` block |
| `PLACEHOLDER_SHA256_MACOS_X64` | Homebrew formula `on_intel` block |
| `PLACEHOLDER_SHA256_LINUX_X86_64` | Homebrew formula `on_linux` block |
| `PLACEHOLDER_SHA256_WINDOWS` | Scoop manifest `hash`, Winget `InstallerSha256` |
| `sha256-PLACEHOLDER_HASH_X86_64_LINUX=` | flake.nix x86_64-linux source |
| `sha256-PLACEHOLDER_HASH_AARCH64_LINUX=` | flake.nix aarch64-linux source |
| `sha256-PLACEHOLDER_HASH_X86_64_DARWIN=` | flake.nix x86_64-darwin source |
| `sha256-PLACEHOLDER_HASH_AARCH64_DARWIN=` | flake.nix aarch64-darwin source |

### Version Without `v` Prefix
**Apply to:** All files — `version` fields, `pkgver`, binary filename references
**Source:** `deno.json` line 3 (`"version": "0.26.1"`), release.yml lines 46-47 (`NORMALIZED_VERSION="${RAW_VERSION#v}"`)
**Rule:** The `v` prefix appears ONLY in GitHub release download URL paths (`/download/v${version}/...`). Never in the version field itself.

### Description Text
**Apply to:** All 7 files
**Source:** `deno.json` line 4: `"description": "nsyte - publish your site to nostr and blossom servers"`
**Canonical form for manifests:** `"Publish your site to nostr and blossom servers"` (sentence case, no dash-prefix, no trailing period)

### Repository URL
**Apply to:** All 7 files
**Canonical value:** `https://github.com/sandwichfarm/nsyte`

### License
**Apply to:** All 7 files
**Canonical value:** `MIT`
**License file URL:** `https://github.com/sandwichfarm/nsyte/blob/main/LICENSE`

### Maintainer Identity
**Apply to:** PKGBUILD
**Source:** existing `.packaging/aur/PKGBUILD` line 1 (email updated to match user AGENTS.md: `sandwich.farm@protonmail.com`)
```bash
# Maintainer: sandwichfarm <sandwich.farm@protonmail.com>
```

---

## No Analog Found

Files with no close match in the codebase (use RESEARCH.md templates directly):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/winget/sandwichfarm.nsyte.version.yaml` | config | batch/transform | No winget manifests anywhere in `.packaging/` |
| `packages/winget/sandwichfarm.nsyte.installer.yaml` | config | batch/transform | No winget manifests anywhere in `.packaging/` |
| `packages/winget/sandwichfarm.nsyte.locale.en-US.yaml` | config | batch/transform | No winget manifests anywhere in `.packaging/` |
| `flake.nix` | config | batch/transform | No Nix files in codebase; `.packaging/` has no flatpak/snap content that maps to Nix |

---

## Analog Quality Notes

**`.packaging/aur/PKGBUILD`** — valuable for maintainer header, metadata field order, placeholder string style; NOT useful for source/sha256/package() structure (source build vs binary package are fundamentally different strategies).

**`.packaging/homebrew/nsyte.rb`** — valuable for class name `Nsyte`, `test do` block, overall file structure; NOT useful for url/sha256/depends_on (old source-build pattern must be replaced with on_macos/on_linux/on_arm/on_intel prebuilt-binary pattern).

**`.packaging/scoop/nsyte.json`** — valuable for `checkver.github`, `description`, `license`, `homepage` field values; partially useful for autoupdate structure (old `architecture.64bit` nesting is outdated schema, must be flattened).

---

## Metadata

**Analog search scope:** `/home/sandwich/Develop/nsyte/.packaging/`, `.github/workflows/release.yml`, `deno.json`
**Files scanned:** 5 source files read (PKGBUILD, nsyte.rb, nsyte.json, release.yml, deno.json)
**Pattern extraction date:** 2026-05-05
