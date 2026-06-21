# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.6 - OS Package Manager/Distributors

**Shipped:** 2026-05-07
**Phases:** 7 | **Plans:** 12

### What Was Built

- Package-manager source templates moved into `packages/` for AUR, Homebrew, Scoop, Winget, Nix, Chocolatey, Debian, Flatpak, and Snap.
- `publish-packages.yml` wires release-triggered package publication with shared asset polling/checksum setup and independent manager jobs.
- AUR, Homebrew, Scoop, Winget, and Nix publication/update paths now have CI implementations and `docs/RELEASING.md` runbooks.

### What Worked

- Preserving `.packaging` analogs before applying the pipeline branch patterns avoided losing Chocolatey, Debian, Flatpak, and Snap coverage.
- Independent package-manager jobs matched the failure-isolation goal and kept each manager's validation readable.
- The final open-artifact audit caught stale debug sessions and an already-consumed seed before archive.

### What Was Inefficient

- External package-manager UAT could not close locally because the required GitHub repos, secrets, package-manager runtimes, and live release workflows were not available.
- Some generated milestone accomplishments needed manual cleanup before they were useful as a durable summary.

### Patterns Established

- `packages/` is the package source-of-truth.
- Placeholder replacement must be named, fail-fast, and idempotent for package templates.
- Runtime distribution proof should be split from static pipeline proof when external registries and secrets are the real gate.

### Key Lessons

1. Check external repo and secret existence early in package-manager milestones; missing infrastructure should be recorded as a live-UAT boundary before close.
2. Treat dormant seeds as close blockers only if their trigger remains unimplemented; otherwise mark them implemented with phase evidence.
3. Archive package-manager milestones with explicit external-UAT deferrals so future release work has a precise checklist rather than a vague "human needed" state.

### Cost Observations

- Sessions: multiple interrupted/resumed GSD passes.
- Notable: targeted Deno gates plus `audit-open` were more useful than repo-wide lint for closeout confidence.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v1.6 | 7 | Package-manager work needs static implementation gates plus separate external runtime gates. |

### Top Lessons

1. Keep durable planning artifacts, but close or archive stale open-state records before milestone completion.
2. Prefer repo-local validation for implementation proof and make external live-UAT prerequisites concrete.
