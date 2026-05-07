# Phase 20: Packaging Infrastructure and Templates - Research

**Researched:** 2026-05-05
**Domain:** OS package manager template files (AUR PKGBUILD, Homebrew formula, Scoop manifest, Winget YAML, Nix flake)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- PKGBUILD: `-bin` naming convention (`nsyte-bin`), source entries for x86_64 and aarch64, SHA256 placeholder markers CI can inject
- Homebrew formula: per-platform `url`/`sha256` blocks for macOS arm64, macOS x86_64, Linux x86_64 — no `bottle` block
- Homebrew formula class name: `Nsyte`
- Scoop manifest: `version` field has no `v` prefix; requires `checkver` and `autoupdate` fields
- Winget: three YAML files (`nsyte.version.yaml`, `nsyte.installer.yaml`, `nsyte.locale.en-US.yaml`), `InstallerType: portable`
- Nix: `flake.nix` at repo root, outputs for linux-x86_64, linux-aarch64, darwin-x86_64, darwin-aarch64

### Claude's Discretion
All implementation details beyond the locked decisions above are at Claude's discretion.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase was skipped for this infrastructure phase. All scope is captured in the requirements.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | `packages/<manager>/` directory structure with template files for aur, homebrew, scoop, winget, nix | Directory layout defined; all five formats researched |
| AUR-01 | `packages/aur/PKGBUILD` with `-bin` naming, source entries for all release platforms, SHA256 placeholders | PKGBUILD format verified from goreleaser-bin (live AUR example); arch-specific source_x86_64/source_aarch64 pattern confirmed |
| BREW-01 | `packages/homebrew/Formula/nsyte.rb` with per-platform url/sha256 blocks for macOS arm64, macOS x86_64, Linux x86_64 — no bottle block | on_macos/on_linux/on_arm/on_intel block pattern verified from Homebrew docs |
| SCOOP-01 | `packages/scoop/bucket/nsyte.json` with correct version, url, hash, checkver, autoupdate fields — no `v` prefix in version | Scoop manifest schema verified; checkver github pattern and autoupdate $version variable confirmed |
| WINGET-01 | Three YAML manifests (version, installer, locale.en-US) with correct schema version, InstallerType: portable, all required fields | ManifestVersion 1.12.0 confirmed from Microsoft Learn (updated March 2026); all three file structures documented |
| NIX-01 | `flake.nix` at repo root with packages.nsyte outputs for all four platforms | bun package.nix pattern from nixpkgs verified; autoPatchelfHook Linux-only pattern confirmed |
</phase_requirements>

---

## Summary

This phase creates version-controlled template files in `packages/` for five package managers: AUR (Arch Linux), Homebrew (macOS/Linux tap), Scoop (Windows bucket), Winget (Windows community repo), and Nix (flake.nix at repo root). All templates use placeholder values for version-specific checksums so Phase 21+ CI can patch them programmatically via `sed` substitution.

The current nsyte release (v0.26.1) provides binaries for Linux x86_64, macOS arm64, macOS x64, and Windows x64. There is no Linux aarch64 binary in the current release workflow, but `deno compile` supports `--target aarch64-unknown-linux-gnu` and the CONTEXT.md explicitly requires the PKGBUILD and flake.nix to include aarch64 Linux entries. Phase 20 templates must include aarch64 Linux placeholder entries even though the binary is not yet released — the template is the forward-looking source of truth.

The Nix derivation requires `autoPatchelfHook` on Linux because `deno compile` produces a **dynamically linked ELF** binary that depends on glibc (confirmed: `deno` itself shows `interpreter /lib64/ld-linux-x86-64.so.2` under ELF analysis). Darwin binaries are Mach-O and do not need patching.

**Primary recommendation:** Use `PLACEHOLDER_SHA256_<ARCH>` as the placeholder string in all templates; it is unambiguous for `sed` substitution and CI authors can identify exactly which placeholder maps to which architecture.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AUR package template | Source control (packages/aur/) | CI (Phase 22 pushes to AUR git) | Template lives in repo; CI patches and forwards |
| Homebrew formula template | Source control (packages/homebrew/) | Tap repo (sandwichfarm/homebrew-nsyte) | Template is the authoritative formula; Phase 23 CI pushes to tap |
| Scoop manifest template | Source control (packages/scoop/) | Bucket repo (sandwichfarm/scoop-nsyte) | Template defines structure; Phase 24 CI pushes to bucket |
| Winget manifests | Source control (packages/winget/) | microsoft/winget-pkgs PR (Phase 25) | Templates are PR-ready; Phase 25 CI opens PR |
| Nix flake | Repo root (flake.nix) | CI (Phase 26 patches hashes in-repo) | flake.nix lives in main repo; CI commits hash updates |

---

## Standard Stack

### Core — What Each Manager Needs

| Format | File(s) | Language/Schema |
|--------|---------|-----------------|
| AUR PKGBUILD | `packages/aur/PKGBUILD` | Bash-like DSL |
| Homebrew formula | `packages/homebrew/Formula/nsyte.rb` | Ruby DSL |
| Scoop manifest | `packages/scoop/bucket/nsyte.json` | JSON |
| Winget manifests | `packages/winget/nsyte.version.yaml`, `nsyte.installer.yaml`, `nsyte.locale.en-US.yaml` | YAML |
| Nix flake | `flake.nix` (repo root) | Nix expression language |

### No External Tooling Required for Phase 20

Phase 20 is pure file creation — no build tools, no CI runners, no package manager CLIs needed to write the templates. Validation tools (makepkg, brew, winget validate, nix flake check) are deferred to Phase 21+.

---

## Release Asset Reference (VERIFIED from release.yml and GitHub API)

Current release: v0.26.1

| Platform | Asset Name Pattern | Download URL Pattern |
|----------|-------------------|---------------------|
| Linux x86_64 | `nsyte-linux-{VERSION}` | `github.com/sandwichfarm/nsyte/releases/download/v{VERSION}/nsyte-linux-{VERSION}` |
| macOS arm64 | `nsyte-macos-arm64-{VERSION}` | `github.com/sandwichfarm/nsyte/releases/download/v{VERSION}/nsyte-macos-arm64-{VERSION}` |
| macOS x64 (Intel) | `nsyte-macos-x64-{VERSION}` | `github.com/sandwichfarm/nsyte/releases/download/v{VERSION}/nsyte-macos-x64-{VERSION}` |
| Windows x64 | `nsyte-windows-{VERSION}.exe` | `github.com/sandwichfarm/nsyte/releases/download/v{VERSION}/nsyte-windows-{VERSION}.exe` |
| Linux aarch64 | **NOT YET RELEASED** | Future: `nsyte-linux-aarch64-{VERSION}` (templates must include placeholder) |

[VERIFIED: GitHub API — github.com/sandwichfarm/nsyte/releases/latest]

Version is normalized semver WITHOUT `v` prefix in filenames (e.g. `0.26.1`, `1.6.0`).
The tag itself uses the `v` prefix (e.g., `v0.26.1`), but binary filenames and the `version` field in all manifests use the bare number.

**Important:** Compressed variants also exist (`nsyte-linux-compressed-{VERSION}`, etc.) but package managers should reference the standard uncompressed binaries for reliability.

---

## Architecture Patterns

### AUR PKGBUILD for a `-bin` Package

**Verified pattern** from goreleaser-bin (live AUR package, fetched 2026-05-05):
[VERIFIED: aur.archlinux.org/cgit/aur.git/plain/PKGBUILD?h=goreleaser-bin]

Key structural rules:
- `pkgname` must end in `-bin` → `nsyte-bin`
- `provides` and `conflicts` reference the name without `-bin` → `provides=('nsyte')` `conflicts=('nsyte')`
- `arch` array lists all supported architectures → `arch=('x86_64' 'aarch64')`
- Architecture-specific sources use `source_<arch>=()` and `sha256sums_<arch>=()`
- `package()` uses `install -Dm755 "<binary>" "${pkgdir}/usr/bin/nsyte"`
- `.SRCINFO` is generated by CI via `makepkg --printsrcinfo` (Phase 22)

**Placeholder convention:** Use `'PLACEHOLDER_SHA256_X86_64'` and `'PLACEHOLDER_SHA256_AARCH64'` as the checksum strings so CI can `sed -i "s/PLACEHOLDER_SHA256_X86_64/${computed_hash}/"` without ambiguity.

**Note on aarch64:** The current release workflow does not build a Linux aarch64 binary. The PKGBUILD template must include an aarch64 source entry with a placeholder. Phase 22 CI will need to either (a) add the aarch64 build step to release.yml first, or (b) temporarily ship a x86_64-only PKGBUILD. The template should include aarch64 as specified, with a comment noting the binary must exist in the release before CI injection works.

#### PKGBUILD Template Structure

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

# NOTE: aarch64 Linux binary requires release.yml to include aarch64 build step
source_aarch64=(
  "nsyte-linux-aarch64-${pkgver}::https://github.com/sandwichfarm/nsyte/releases/download/v${pkgver}/nsyte-linux-aarch64-${pkgver}"
)
sha256sums_aarch64=('PLACEHOLDER_SHA256_AARCH64')

package() {
  case "$CARCH" in
    x86_64)   install -Dm755 "nsyte-linux-${pkgver}" "${pkgdir}/usr/bin/nsyte" ;;
    aarch64)  install -Dm755 "nsyte-linux-aarch64-${pkgver}" "${pkgdir}/usr/bin/nsyte" ;;
  esac
  install -Dm644 /dev/stdin "${pkgdir}/usr/share/licenses/${pkgname}/LICENSE" <<LICENSE
MIT License — see https://github.com/sandwichfarm/nsyte/blob/main/LICENSE
LICENSE
}
```

---

### Homebrew Formula for a Personal Tap

**Verified pattern** from Homebrew Formula Cookbook:
[CITED: docs.brew.sh/Formula-Cookbook]

Key rules:
- Class name: `Nsyte` (specified in CONTEXT.md)
- No `bottle do ... end` block — the formula IS the binary, bottles are pre-built versions of source formulas
- Use `on_macos do` with nested `on_arm do` / `on_intel do` for platform-specific url/sha256
- Use `on_linux do` for Linux x86_64
- `def install` uses `bin.install "nsyte"` but the binary name inside the downloaded archive is the release asset name — it must be renamed or the install line must reference the correct filename
- `test do` block is required for tap submission and good practice

**Critical detail:** The release assets are not archives — they are bare executables (not `.tar.gz`). This simplifies the formula: there is no `extract_dir` or unpack step. `fetchurl` (not `fetchzip`) is used in Homebrew internally when there is no archive extension. However, Homebrew formulas use `url` + `sha256` directly and handle bare executables in `def install` by referencing the downloaded filename.

When Homebrew downloads a URL with no archive extension, the downloaded file lands in the build directory with the basename from the URL. So `nsyte-macos-arm64-0.26.1` will be in the working directory as that filename.

#### Homebrew Formula Template Structure

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
    # Binary asset name matches the URL basename
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

**Note on tap repo:** BREW-01 specifies the tap repo is `sandwichfarm/homebrew-nsyte`. The formula file must be placed at `Formula/nsyte.rb` inside that tap repo. In the main nsyte repo, the template lives at `packages/homebrew/Formula/nsyte.rb` and Phase 23 CI copies it to the tap repo with patched checksums.

---

### Scoop Manifest JSON Schema

**Verified pattern** from ScoopInstaller/Scoop wiki:
[CITED: github.com/ScoopInstaller/Scoop/wiki/App-Manifests]
[CITED: github.com/ScoopInstaller/Scoop/wiki/App-Manifest-Autoupdate]

Key rules:
- `version` field: bare semver, NO `v` prefix (e.g., `"0.26.1"` not `"v0.26.1"`)
- `checkver: { "github": "https://github.com/sandwichfarm/nsyte" }` — Scoop will match the tag and strip the `v` prefix automatically
- `autoupdate.url` uses `$version` variable (bare semver, no `v`) in the URL; GitHub release download URLs use `v$version` in the path
- `hash` is a bare sha256 hex string (Scoop default) or prefixed `"sha256:..."` — bare is fine
- `bin` sets the command name exposed to the user
- nsyte is a Windows `.exe` — the URL references `nsyte-windows-{VERSION}.exe`

**Version stripping:** When Scoop's `checkver: github` detects tag `v0.26.1`, `$version` becomes `0.26.1`. The autoupdate URL must reconstruct the `v` prefix in the path: `https://github.com/.../releases/download/v$version/nsyte-windows-$version.exe`.

#### Scoop Manifest Template Structure

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

**The `#/nsyte.exe` URL fragment:** This is a Scoop convention that renames the downloaded file to `nsyte.exe` in the Scoop apps directory. Without it, the binary would be named `nsyte-windows-0.26.1.exe`.

**Hash autoupdate mode:** `"mode": "download"` tells Scoop to download the file and compute the hash. Alternatively, if a `.sha256` file is published alongside the binary, use `"url": "$url.sha256"`. Since nsyte does not publish separate hash files, `"mode": "download"` is the correct choice.

**Note on bucket repo:** SCOOP-01 specifies the bucket repo is `sandwichfarm/scoop-nsyte`. The manifest lives at `bucket/nsyte.json` inside that repo. In the main nsyte repo, the template is at `packages/scoop/bucket/nsyte.json`.

---

### Winget YAML Manifests

**Verified from:** Microsoft Learn (docs updated March 2026) — ManifestVersion **1.12.0**
[VERIFIED: learn.microsoft.com/en-us/windows/package-manager/package/manifest]

Key rules:
- Three YAML files required; naming pattern: `sandwichfarm.nsyte.<type>.yaml`
- All three files share the same `PackageIdentifier` and `PackageVersion`
- ManifestVersion must be `"1.12.0"` (current as of March 2026 — verify against winget-pkgs before PR submission in Phase 25)
- `InstallerType: portable` means the binary is self-contained, extracted to a user-configured location with no registry entries or system-wide install
- Portable installers do NOT require `InstallerSwitches` (no `/S` flag etc.)
- `Architecture: x64` for the Windows x64 binary

**Package identifier convention:** `Publisher.Package` format → `sandwichfarm.nsyte`

**File names in packages/winget/:**
- `sandwichfarm.nsyte.version.yaml`
- `sandwichfarm.nsyte.installer.yaml`
- `sandwichfarm.nsyte.locale.en-US.yaml`

(The CONTEXT.md uses `nsyte.version.yaml` etc. — clarify: the full winget-pkgs convention is `Publisher.Package.type.yaml`, so `sandwichfarm.nsyte.version.yaml`. The planner should use the full identifier form.)

#### version.yaml Template

```yaml
PackageIdentifier: "sandwichfarm.nsyte"
PackageVersion: "PLACEHOLDER_VERSION"
DefaultLocale: "en-US"
ManifestType: "version"
ManifestVersion: "1.12.0"
```

#### installer.yaml Template

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

#### locale.en-US.yaml Template

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

**InstallerSha256 format:** winget requires a 64-character lowercase hex SHA256 string (not SRI format, not prefixed). The placeholder must be replaced with this exact format by Phase 25 CI.

---

### Nix flake.nix for Prebuilt Binaries

**Verified pattern** from:
- nixpkgs bun package (stdenvNoCC + autoPatchelfHook Linux-conditional pattern) [VERIFIED: github.com/NixOS/nixpkgs/blob/nixos-unstable/pkgs/by-name/bu/bun/package.nix]
- NixOS Wiki Packaging/Binaries [CITED: wiki.nixos.org/wiki/Packaging/Binaries]
- Nix flake multi-system pattern (forAllSystems) [CITED: nixos.wiki/wiki/Flakes]

**Critical fact — deno compile binary is dynamically linked on Linux:**
Confirmed by ELF inspection of the system deno binary: `dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2`. Issue #10263 (denoland/deno) confirms deno compile does not produce a static binary. `autoPatchelfHook` is therefore REQUIRED in the Linux derivation.
[VERIFIED: ELF analysis, denoland/deno#10263]

**Darwin binaries** are Mach-O format. `autoPatchelfHook` is an ELF-only tool and must NOT be applied to Darwin derivations. Darwin prebuilt binaries from `deno compile` run directly without patching on macOS because the dynamic loader path is embedded in the Mach-O format using `@rpath` conventions.

**aarch64-linux:** No binary exists yet in nsyte releases. The flake.nix template must include the aarch64-linux platform with a placeholder hash. Nix will fail to build for that system until Phase 26 CI provides a real hash AND the release workflow produces the binary.

**SRI hash format:** Nix flakes use SRI hashes (`sha256-<base64>=`) not hex SHA256. The placeholder string must be recognizable for sed substitution: use `"sha256-PLACEHOLDER_AARCH64_LINUX="` etc. (or use a companion `sources.json` as the bun derivation does).

#### flake.nix Template Structure

```nix
{
  description = "nsyte — publish your site to nostr and blossom servers";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      version = "PLACEHOLDER_VERSION";

      # Per-system source URLs and SRI hashes.
      # CI patches these placeholders on release via sed.
      sources = {
        "x86_64-linux" = {
          url = "https://github.com/sandwichfarm/nsyte/releases/download/v${version}/nsyte-linux-${version}";
          hash = "sha256-PLACEHOLDER_HASH_X86_64_LINUX=";
        };
        # NOTE: aarch64-linux binary requires release.yml aarch64 build step.
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

            # autoPatchelfHook patches the ELF interpreter path for NixOS.
            # Only needed on Linux — Darwin uses Mach-O, no patching needed.
            nativeBuildInputs = pkgs.lib.optionals isLinux [
              pkgs.autoPatchelfHook
            ];

            # glibc is the only runtime dependency for a deno-compile binary.
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

**SRI placeholder format explanation:** Nix requires `sha256-<base64>=` strings for `fetchurl` hashes. The placeholder `"sha256-PLACEHOLDER_HASH_X86_64_LINUX="` retains the `sha256-` prefix and `=` suffix so the pattern stays structurally valid for identification. CI replaces the entire quoted string including the prefix.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA256 computation in CI | Custom hash logic | `sha256sum` (Linux) / `shasum -a 256` (macOS) | Standard tools, no dependencies |
| PKGBUILD .SRCINFO generation | Custom .SRCINFO writer | `makepkg --printsrcinfo` | Official tool, guaranteed correct format |
| Winget manifest creation | Custom YAML builder | Copy template + sed replace | Manifests are static YAML, not generated |
| Nix SRI hash computation | Custom base64 encoder | `nix-prefetch-url --type sha256` or `nix hash file` | Nix has built-in hash tools |
| Homebrew formula updates | Custom Ruby manipulator | `sed` or `gsed` on the formula file | The formula is simple text with known patterns |

---

## Common Pitfalls

### Pitfall 1: Version with `v` prefix in the wrong field
**What goes wrong:** Using `v0.26.1` instead of `0.26.1` in the `version` field of Scoop manifests or Homebrew formulas causes install failures.
**Why it happens:** GitHub tags use `v` prefix; copy-paste from tag name into version field.
**How to avoid:** All `version` fields in all manifests use bare semver (no `v`). The `v` appears only in the GitHub release URL path (`/download/v${version}/`).
**Warning signs:** Scoop's `checkver` tool reports version mismatch; Homebrew `brew install` fails with version validation error.

### Pitfall 2: Missing `provides`/`conflicts` in PKGBUILD
**What goes wrong:** Users who install `nsyte-bin` cannot be upgraded from `nsyte` (source package), and both can be installed simultaneously.
**Why it happens:** Forgetting the `provides=('nsyte')` `conflicts=('nsyte')` pair.
**How to avoid:** Always include both in `-bin` packages. The goreleaser-bin PKGBUILD pattern shows this.

### Pitfall 3: Homebrew formula with `bottle do` block for a prebuilt binary
**What goes wrong:** A `bottle do` block signals Homebrew to serve a pre-compiled version of the SOURCE formula, not the binary itself. It is irrelevant and confusing here.
**Why it happens:** Copying from homebrew-core examples that are source formulas.
**How to avoid:** Never include `bottle do` in a formula that downloads prebuilt binaries.

### Pitfall 4: Nix `dontUnpack = true` missing
**What goes wrong:** Nix's default unpack phase tries to extract the binary as if it's a tarball, fails, and the build errors.
**Why it happens:** The release assets are bare executables, not archives.
**How to avoid:** Set `dontUnpack = true` and `dontBuild = true`. Reference `$src` directly in `installPhase`.

### Pitfall 5: Winget `InstallerSha256` as SRI or non-hex format
**What goes wrong:** Winget validation rejects SRI-format hashes (`sha256-...`), prefixed hashes (`sha256:...`), or uppercase hex.
**Why it happens:** Other package managers use different hash formats.
**How to avoid:** `InstallerSha256` must be a 64-character lowercase hex SHA256 string with no prefix. Compute with `sha256sum file | awk '{print $1}'`.

### Pitfall 6: aarch64 Linux binary not yet in releases
**What goes wrong:** The PKGBUILD and flake.nix include aarch64 Linux source/hash entries. If CI injects checksums before the binary exists in the release, the checksum will be wrong or missing.
**Why it happens:** Phase 20 is forward-looking; Phase 22 CI wiring precedes the binary existing.
**How to avoid:** Include a comment in the PKGBUILD noting the binary prerequisite. Phase 22 task must add the aarch64 build step to release.yml BEFORE attempting AUR pushes.

### Pitfall 7: Scoop `autoupdate.hash.mode: download` vs hash file
**What goes wrong:** If `mode: download` is used but nsyte releases are large (88MB), Scoop's autoupdate bot redownloads the entire binary just to checksum it.
**Why it happens:** No separate `.sha256` file is published alongside the binary.
**How to avoid:** Accept the download cost for now. Phase 24 can add a hash sidecar file to the release workflow to enable `url` mode.

### Pitfall 8: Winget ManifestVersion drift
**What goes wrong:** The manifests are rejected by winget-pkgs PR automation if the ManifestVersion is out of date.
**Why it happens:** Microsoft updates the schema; templates written today may be stale for the Phase 25 PR.
**How to avoid:** Before the Phase 25 PR submission, verify the current ManifestVersion from `microsoft/winget-pkgs/doc/manifest/schema/`. The template uses 1.12.0 (correct as of March 2026), but this must be re-verified at Phase 25 execution time.

---

## Runtime State Inventory

Step 2.5: SKIPPED — this is a greenfield file-creation phase, not a rename/refactor/migration.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git | Writing template files to repo | ✓ | (system git) | — |
| Text editor / Write tool | Creating PKGBUILD, .rb, .json, .yaml, .nix files | ✓ | — | — |
| curl (for verification) | Confirming release asset names | ✓ | system | — |

Phase 20 is pure file creation with no external build tools required. Validation tools (makepkg, brew, winget validate, nix flake check) are deferred to Phase 21+.

---

## Code Examples

### Complete goreleaser-bin PKGBUILD (verified live AUR example, 2026-05-05)

```bash
# Actual content from aur.archlinux.org/cgit/aur.git/plain/PKGBUILD?h=goreleaser-bin
# (truncated — shows the arch-specific source/sha pattern)
pkgname='goreleaser-bin'
pkgver=2.15.4
pkgrel=1
arch=('aarch64' 'armv7h' 'i686' 'x86_64')

source_aarch64=("${pkgname}_${pkgver}_aarch64.tar.gz::https://github.com/.../goreleaser_Linux_arm64.tar.gz")
sha256sums_aarch64=('de01ca1497571e9b348413cd2e7f74be49b8d57696ae386f7eedd06176544a88')

source_x86_64=("${pkgname}_${pkgver}_x86_64.tar.gz::https://github.com/.../goreleaser_Linux_x86_64.tar.gz")
sha256sums_x86_64=('aae00c71a4a6d55e08cce9273a1516bdce33c1e07cffb7e502fa6fec4377dede')

package() {
  install -Dm755 "./goreleaser" "${pkgdir}/usr/bin/goreleaser"
  install -Dm644 "./LICENSE.md" "${pkgdir}/usr/share/licenses/goreleaser/LICENSE"
}
```

**nsyte difference:** nsyte assets are bare executables (not tarballs), so the source URL has no archive extension and there is no intermediate extract step. Use a rename alias in the source URL: `"nsyte-linux-${pkgver}::https://github.com/sandwichfarm/nsyte/releases/download/v${pkgver}/nsyte-linux-${pkgver}"`. No `::` rename alias is strictly required but makes the local filename predictable.

### Nix autoPatchelfHook conditional (from bun pattern)

```nix
# From nixpkgs bun/package.nix — the canonical pattern
nativeBuildInputs = pkgs.lib.optionals stdenvNoCC.hostPlatform.isLinux [
  pkgs.autoPatchelfHook
];

buildInputs = pkgs.lib.optionals stdenvNoCC.hostPlatform.isLinux [
  pkgs.glibc
];
```

### Scoop version without `v` prefix with `v` in URL

```json
{
  "version": "0.26.1",
  "url": "https://github.com/.../releases/download/v0.26.1/nsyte-windows-0.26.1.exe#/nsyte.exe",
  "autoupdate": {
    "url": "https://github.com/.../releases/download/v$version/nsyte-windows-$version.exe#/nsyte.exe"
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Winget ManifestVersion 1.6.0 | ManifestVersion 1.12.0 | 2024-2025 | Manifests using 1.6.0 may still be accepted but use 1.12.0 for new submissions |
| Nix hex sha256 in fetchurl | SRI hash format (`sha256-<base64>=`) | Nix 2.4 (2021) | Old hex hashes still work but SRI is preferred for pure evaluation |
| Homebrew `Hardware::CPU.arm?` conditionals in `url` | `on_arm do` / `on_intel do` / `on_macos do` / `on_linux do` blocks | Homebrew 3.x | New block syntax is cleaner and the current standard |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Darwin (macOS) prebuilt binaries from deno compile run without patching on macOS (Mach-O, no ELF interpreter issue) | Nix pattern | If darwin binary has dylib issues, the derivation needs additional fixup (low probability — deno bundles its runtime) |
| A2 | The `PLACEHOLDER_SHA256_*` / `sha256-PLACEHOLDER_*=` convention is unambiguous enough for CI sed substitution | All templates | If CI uses a different placeholder format, sed patterns must be updated |
| A3 | nsyte's deno-compiled binary on Linux links only against glibc (no libstdc++, OpenSSL, etc.) | Nix buildInputs | If additional dynamic libs are needed, `buildInputs` must be extended |
| A4 | Winget ManifestVersion 1.12.0 is still current at Phase 25 execution time | Winget section | Must be re-verified at Phase 25; schema version drifts |

---

## Open Questions

1. **aarch64 Linux binary timeline**
   - What we know: deno compile supports `--target aarch64-unknown-linux-gnu`; current release.yml has no aarch64 Linux build job
   - What's unclear: Will Phase 22 add the aarch64 Linux build before or after the AUR CI wiring?
   - Recommendation: Phase 20 templates include aarch64 with placeholders and a comment; Phase 22 plan must address both (a) adding the build step to release.yml and (b) patching the PKGBUILD

2. **Homebrew tap repo creation**
   - What we know: BREW-01 requires `sandwichfarm/homebrew-nsyte` tap repo with `Formula/nsyte.rb`
   - What's unclear: The tap repo does not yet exist (only the main nsyte repo was confirmed)
   - Recommendation: Phase 20 creates the formula template at `packages/homebrew/Formula/nsyte.rb`; Phase 23 creates the tap repo. Phase 20 does not need to touch GitHub.

3. **Scoop bucket repo creation**
   - What we know: SCOOP-01 requires `sandwichfarm/scoop-nsyte` bucket repo with `bucket/nsyte.json`
   - What's unclear: The bucket repo does not yet exist
   - Recommendation: Same split — Phase 20 creates the manifest template; Phase 24 creates the repo.

---

## Validation Architecture

> workflow.nyquist_validation is not explicitly set in config.json — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno test (deno.json task: `deno task test`) |
| Config file | `deno.test.json` |
| Quick run command | `deno task test:unit` |
| Full suite command | `deno task test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | `packages/` directory and subdirectories exist | smoke | `test -d packages/aur && test -d packages/homebrew && test -d packages/scoop && test -d packages/winget` | ❌ Wave 0 (shell check, no Deno test needed) |
| AUR-01 | PKGBUILD is syntactically parseable | smoke | `bash -n packages/aur/PKGBUILD` | ❌ Wave 0 |
| BREW-01 | Formula Ruby syntax is valid | smoke | `ruby -c packages/homebrew/Formula/nsyte.rb` | ❌ Wave 0 |
| SCOOP-01 | Scoop manifest is valid JSON | smoke | `python3 -m json.tool packages/scoop/bucket/nsyte.json > /dev/null` | ❌ Wave 0 |
| WINGET-01 | All three YAML files parse without error | smoke | `python3 -c "import yaml; [yaml.safe_load(open(f)) for f in ['packages/winget/sandwichfarm.nsyte.version.yaml','packages/winget/sandwichfarm.nsyte.installer.yaml','packages/winget/sandwichfarm.nsyte.locale.en-US.yaml']]"` | ❌ Wave 0 |
| NIX-01 | flake.nix is valid Nix syntax | smoke | `nix --extra-experimental-features 'nix-command flakes' flake check --no-build 2>&1 \| head -20` (or `nix-instantiate --parse flake.nix`) | ❌ Wave 0 |

**Note:** These are all syntax/structure checks, not functional tests. Functional validation (makepkg, brew install, etc.) requires the target platform's toolchain and is deferred to Phase 21+.

### Sampling Rate
- **Per task commit:** bash/ruby/json/yaml syntax check on the specific file created
- **Per wave merge:** All syntax checks as a group
- **Phase gate:** All syntax checks green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] No new Deno test files needed — validation is shell/python/ruby syntax checks
- [ ] `ruby` must be available for `.rb` syntax check (`ruby -c`) — check with `command -v ruby`
- [ ] `python3` with `pyyaml` needed for YAML check — `python3 -c "import yaml"` to verify

*(If ruby or pyyaml unavailable, fallback: visual inspection + note in verification)*

---

## Security Domain

This phase creates static template files with placeholder strings. No authentication, session management, access control, input validation, or cryptography is implemented in Phase 20 itself. Security concerns apply to Phase 21+ (CI secrets management, PAT tokens, SSH keys for AUR).

ASVS categories are not applicable to Phase 20 (file creation only).

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: GitHub API — github.com/sandwichfarm/nsyte/releases/latest] — confirmed release asset names and version (v0.26.1)
- [VERIFIED: release.yml — local file /home/sandwich/Develop/nsyte/.github/workflows/release.yml] — confirmed asset naming pattern, no aarch64 Linux build
- [VERIFIED: aur.archlinux.org/cgit/aur.git/plain/PKGBUILD?h=goreleaser-bin] — live PKGBUILD with source_x86_64/source_aarch64 pattern
- [VERIFIED: Microsoft Learn manifest page, updated March 2026] — ManifestVersion 1.12.0, three-file structure
- [VERIFIED: ELF analysis of local deno binary] — confirmed deno is dynamically linked ELF (not static)
- [VERIFIED: deno compile --help output] — confirmed aarch64-unknown-linux-gnu is a supported target

### Secondary (MEDIUM confidence)
- [CITED: docs.brew.sh/Formula-Cookbook] — on_macos/on_linux/on_arm/on_intel block pattern
- [CITED: github.com/ScoopInstaller/Scoop/wiki/App-Manifests] — Scoop manifest schema
- [CITED: github.com/ScoopInstaller/Scoop/wiki/App-Manifest-Autoupdate] — autoupdate $version variable, checkver github
- [CITED: wiki.nixos.org/wiki/Packaging/Binaries] — autoPatchelfHook usage pattern
- [CITED: github.com/NixOS/nixpkgs bun/package.nix] — stdenvNoCC + autoPatchelfHook Linux-conditional pattern

### Tertiary (LOW confidence)
- [ASSUMED: A3] — deno-compile Linux binary links only against glibc — not verified against an actual nsyte binary

---

## Metadata

**Confidence breakdown:**
- AUR PKGBUILD format: HIGH — live AUR PKGBUILD verified
- Homebrew formula format: HIGH — verified from official Homebrew docs
- Scoop manifest format: HIGH — verified from ScoopInstaller wiki
- Winget ManifestVersion: HIGH — verified from Microsoft Learn (March 2026)
- Nix flake pattern: HIGH — verified from nixpkgs bun derivation
- deno compile dynamic linking: HIGH — confirmed by ELF inspection
- aarch64 Linux binary status: HIGH — confirmed absent from releases

**Research date:** 2026-05-05
**Valid until:** 2026-08-05 (90 days — stable formats; Winget ManifestVersion re-verify before Phase 25)
