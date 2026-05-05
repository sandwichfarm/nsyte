---
phase: 20-packaging-infrastructure-and-templates
reviewed: 2026-05-05T12:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - packages/aur/PKGBUILD
  - packages/homebrew/Formula/nsyte.rb
  - packages/scoop/bucket/nsyte.json
  - packages/winget/sandwichfarm.nsyte.version.yaml
  - packages/winget/sandwichfarm.nsyte.installer.yaml
  - packages/winget/sandwichfarm.nsyte.locale.en-US.yaml
  - flake.nix
findings:
  critical: 2
  warning: 5
  info: 0
  total: 7
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-05-05T12:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Seven packaging template files were reviewed: an AUR PKGBUILD, a Homebrew Ruby formula, a Scoop JSON manifest, three Winget YAML manifests, and a Nix flake. The templates are syntactically well-formed and follow the correct structural conventions for each package manager. However, two blockers were found: the aarch64 Linux binary is declared as available in both PKGBUILD and flake.nix but the release workflow never produces it, and the Homebrew formula silently installs a mismatched x86_64 binary on Linux aarch64 hosts. Five additional warnings cover non-pinned Nix inputs, a suspect Winget schema version, an AUR arch declaration that overpromises, a missing Homebrew bottle directive, and Scoop's slow hash-download mode.

---

## Critical Issues

### CR-01: aarch64 Linux binary declared available but never built — PKGBUILD and flake.nix will 404 at install time

**Status: fixed** — commit d8b2d56 (PKGBUILD), commit 465ac41 (flake.nix)

**File:** `packages/aur/PKGBUILD:7,18-22,27` and `flake.nix:17-21`

**Issue:** Both `packages/aur/PKGBUILD` and `flake.nix` declare aarch64 Linux as a supported target and reference the asset `nsyte-linux-aarch64-${version}`. The PKGBUILD sets `arch=('x86_64' 'aarch64')` (line 7), defines `source_aarch64` pointing to that URL (lines 19-21), and installs from it in `package()` (line 27). The flake includes `"aarch64-linux"` in `sources` with a matching URL (line 19). The actual release workflow (`release.yml`) builds only `nsyte-linux` (x86_64); it has no aarch64 Linux job and never uploads `nsyte-linux-aarch64-*` as a release asset. Any AUR user on aarch64 or Nix user on `aarch64-linux` will receive a 404 from GitHub releases. The comments in both files acknowledge the missing build step, but the declarations actively advertise the package as installable today.

**Fix — PKGBUILD:** Restrict `arch` to `x86_64` only until the aarch64 Linux build step is added to `release.yml`:
```bash
# Before (line 7):
arch=('x86_64' 'aarch64')

# After:
arch=('x86_64')
# NOTE: aarch64 support pending release.yml aarch64 Linux build step — re-add when binary is published
```
Remove the `source_aarch64`, `sha256sums_aarch64`, and the `aarch64)` branch of the `case` in `package()`.

**Fix — flake.nix:** Remove the `"aarch64-linux"` entry from the `sources` attrset (lines 17-21) until the release binary exists. Update `supportedSystems` to derive from the reduced `sources`:
```nix
sources = {
  "x86_64-linux" = { ... };
  # "aarch64-linux" pending release.yml aarch64 Linux build step
  "x86_64-darwin" = { ... };
  "aarch64-darwin" = { ... };
};
```

---

### CR-02: Homebrew formula installs x86_64 Linux binary on Linux aarch64 hosts

**Status: fixed** — commit 7306ce8

**File:** `packages/homebrew/Formula/nsyte.rb:18-21,28-29`

**Issue:** The `on_linux` block (lines 18-21) provides a single URL for `nsyte-linux-#{version}` with no architecture guard (`on_intel`/`on_arm` nesting). This x86_64 binary will be downloaded on any Linux host regardless of CPU architecture. The `install` method's else branch (line 28-29) then installs this x86_64 binary on Linux aarch64 machines without error. Homebrew can run on Linux aarch64 (AWS Graviton, Raspberry Pi, etc.). Executing an x86_64 ELF binary on a native aarch64 host without an emulator will produce an `Exec format error` at runtime.

**Fix:** Add an architecture guard inside `on_linux`, or explicitly restrict Linux to x86_64 only (matching the current release reality) with a comment:
```ruby
on_linux do
  on_intel do
    url "https://github.com/sandwichfarm/nsyte/releases/download/v#{version}/nsyte-linux-#{version}"
    sha256 "PLACEHOLDER_SHA256_LINUX_X86_64"
  end
  # on_arm: Linux aarch64 binary not yet built — pending release.yml aarch64 build step
end
```
The `install` method then also needs a corresponding guard:
```ruby
def install
  if OS.mac? && Hardware::CPU.arm?
    bin.install "nsyte-macos-arm64-#{version}" => "nsyte"
  elsif OS.mac?
    bin.install "nsyte-macos-x64-#{version}" => "nsyte"
  elsif Hardware::CPU.intel?
    bin.install "nsyte-linux-#{version}" => "nsyte"
  else
    odie "No prebuilt binary for this platform. See https://github.com/sandwichfarm/nsyte"
  end
end
```

---

## Warnings

### WR-01: flake.nix committed without flake.lock — nixpkgs-unstable is unpinned

**Status: deferred** — deferred-reason: requires nix toolchain not available locally. deferred-to-phase: 26

**File:** `flake.nix:4`

**Issue:** `flake.nix` specifies `inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable"` with no accompanying `flake.lock`. Without a lock file, every `nix build` or `nix run` invocation on a machine that does not already have a cached lock will fetch the latest nixpkgs-unstable commit at that moment. This means two machines running the same `flake.nix` can resolve different nixpkgs (and thus different `autoPatchelfHook`, `glibc`, `stdenvNoCC` versions), breaking reproducibility — a core Nix guarantee. The lock file is generated automatically by any `nix` command but must be committed to the repository.

**Fix:** On a machine with Nix installed, run:
```sh
nix flake update
git add flake.lock
git commit -m "chore: add flake.lock to pin nixpkgs-unstable"
```
If Nix is not available in the development environment, generate the lock in Phase 26's NixOS container and commit it alongside the first real hash substitution.

---

### WR-02: Winget ManifestVersion "1.12.0" is unverified and likely incorrect

**Status: deferred** — deferred-reason: requires schema network check; STATE.md lists this as a verification blocker for Phase 25. deferred-to-phase: 25

**File:** `packages/winget/sandwichfarm.nsyte.version.yaml:5`, `packages/winget/sandwichfarm.nsyte.installer.yaml:9`, `packages/winget/sandwichfarm.nsyte.locale.en-US.yaml:17`

**Issue:** All three Winget manifests declare `ManifestVersion: "1.12.0"`. The 20-02-SUMMARY explicitly acknowledges "Phase 25 must re-verify the current ManifestVersion before opening the PR to winget-pkgs." The current production schema in `microsoft/winget-pkgs` uses ManifestVersion in the 1.6.0–1.9.0 range. If 1.12.0 is not a schema version that Microsoft's winget-pkgs CI recognises, the submission PR will be rejected by the automated manifest validator. A wrong ManifestVersion will silently pass local YAML parsing but fail at submission time.

**Fix:** Before Phase 25, run the Winget manifest validator against `winget-pkgs` current `schemas/` to confirm the correct version. Update all three manifests to the verified version:
```yaml
# Replace in all three files:
ManifestVersion: "1.6.0"   # or whatever the current validated version is
```
Phase 25 CI should verify this automatically before opening the PR.

---

### WR-03: PKGBUILD arch array includes aarch64 before the binary is released

**Status: fixed** — commit d8b2d56 (resolved together with CR-01)

**File:** `packages/aur/PKGBUILD:7`

**Issue:** Even if CR-01 (the 404 at install time) is accepted as a known-future-work stub, declaring `arch=('x86_64' 'aarch64')` in the PKGBUILD has an immediate side effect: AUR tooling (yay, paru, aurutils) on aarch64 systems will show `nsyte-bin` as installable and attempt the build. The source download will fail with a 404. AUR maintainers are also expected to test all declared architectures before submission to the AUR. Until the aarch64 Linux binary is published, the arch array overstates the package's capabilities.

**Fix:** See CR-01. Reduce `arch` to `('x86_64')` until the binary exists.

---

### WR-04: Homebrew formula missing `bottle :unneeded` directive

**Status: fixed** — commit 53e9a68

**File:** `packages/homebrew/Formula/nsyte.rb` (between lines 5 and 7)

**Issue:** For prebuilt binary formulas in third-party taps, Homebrew's audit and bottling infrastructure will attempt to create bottles (pre-compiled binary caches) if no `bottle` block is present. When Homebrew CI runs `brew bottle nsyte`, it will attempt a source build (which will fail since there is no source), or will produce a bottle of a vendored binary which is incorrect. The standard pattern for tap formulas that distribute prebuilt binaries is to declare `bottle :unneeded` to suppress this behavior.

**Fix:** Add the `bottle :unneeded` directive after the `version` field:
```ruby
class Nsyte < Formula
  desc "Publish your site to nostr and blossom servers"
  homepage "https://github.com/sandwichfarm/nsyte"
  license "MIT"
  version "PLACEHOLDER_VERSION"
  bottle :unneeded
  ...
end
```

---

### WR-05: Scoop autoupdate hash uses mode:download — requires full binary download (~88 MB) per update check

**Status: deferred** — deferred-reason: design tradeoff, not a bug. Publishing a SHA256 sidecar file requires a coordinated change to release.yml (Phase 24 CI). Accepted as-is for now; the current behaviour is functional. deferred-to-phase: 24

**File:** `packages/scoop/bucket/nsyte.json:14-17`

**Issue:** `autoupdate.hash.mode: "download"` instructs Scoop's automated update tooling to download the entire Windows EXE to compute its SHA256. At ~88 MB per release asset, this is fragile in Scoop's update infrastructure and can time out in hosted runners. The preferred alternative is a SHA256 sidecar file (e.g., `nsyte-windows-$version.exe.sha256`) published alongside the EXE in the GitHub release, which enables `mode: "download"` to be replaced with a direct `url` pointing to the small text file. The 20-02-SUMMARY acknowledges this as a future improvement.

**Fix:** In Phase 24 CI, add a step to publish a sidecar checksum file:
```bash
sha256sum nsyte-windows-${VERSION}.exe | awk '{print $1}' > nsyte-windows-${VERSION}.exe.sha256
```
Then update the Scoop manifest to reference it:
```json
"autoupdate": {
  "url": "https://github.com/sandwichfarm/nsyte/releases/download/v$version/nsyte-windows-$version.exe#/nsyte.exe",
  "hash": {
    "url": "https://github.com/sandwichfarm/nsyte/releases/download/v$version/nsyte-windows-$version.exe.sha256"
  }
}
```

---

_Reviewed: 2026-05-05T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
