---
phase: 22-aur-pipeline
plan: "02"
subsystem: docs
tags:
  - docs
  - releasing
  - aur
  - secrets
dependency_graph:
  requires:
    - 22-01 (publish-aur CI job — documented in RELEASING.md)
  provides:
    - AUR_SSH_PRIVATE_KEY secret setup documentation
    - One-time AUR bootstrap procedure
    - Local PKGBUILD verification recipe (AUR-05)
  affects:
    - docs/RELEASING.md
tech_stack:
  added: []
  patterns:
    - "Append-not-rewrite pattern — new H2 sections spliced before ## Related files"
    - "Style anchor pattern — mirrors existing RELEASE_TOKEN section structure"
key_files:
  created: []
  modified:
    - docs/RELEASING.md
decisions:
  - "New sections splice BEFORE the existing ## Related files heading (not appended at end) to maintain logical flow"
  - "## Related files section rewritten with AUR bullets appended (not duplicated) — single Related files section covers both RELEASE_TOKEN and AUR contexts"
  - "Used archlinux:base-devel (not :latest) per RESEARCH.md anti-patterns guidance"
  - "Local-verify recipe ends with nsyte --version inside container as positive install proof"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-05"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase 22 Plan 02: AUR Documentation Summary

AUR maintainer documentation appended to RELEASING.md — three new sections covering the AUR_SSH_PRIVATE_KEY secret, one-time bootstrap, and Docker-based local verification recipe.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Append AUR_SSH_PRIVATE_KEY + bootstrap + local-verify sections to RELEASING.md | ed4e8cd | docs/RELEASING.md |

## What Was Built

Three new H2 sections appended to `docs/RELEASING.md` after the existing `## Troubleshooting` section and before `## Related files`:

1. **`## AUR_SSH_PRIVATE_KEY prerequisite`** — mirrors the existing `## RELEASE_TOKEN prerequisite` shape: opener sentence, why-required paragraph, symptom-of-forgetting paragraph. Explains the SSH-based AUR auth model and names the `publish-aur` job as the consumer.

2. **`## Generating and registering the AUR SSH key`** — five-step numbered bootstrap covering: AUR account creation, ssh-keygen with exact flags, public key registration in AUR account settings, empty-repo bootstrap clone that registers `nsyte-bin` under the account, and GitHub secret addition. Includes a Verifying and Rotation subsection.

3. **`## Verifying the AUR PKGBUILD locally (AUR-05)`** — Docker-based recipe using `archlinux:base-devel`, non-root `builder` user, `makepkg -si`, and `nsyte --version` as the positive end-to-end check. Uses `PLACEHOLDER_VERSION` / `PLACEHOLDER_SHA256_X86_64` sed substitution matching the CI job's pattern exactly.

The existing `## Related files` section was updated (not duplicated) to append two AUR bullets: one for `packages/aur/PKGBUILD` and one updating the `publish-packages.yml` bullet to reference the AUR_SSH_PRIVATE_KEY secret and AUR remote URL.

## Splice Method

New sections were inserted **before** the existing `## Related files` heading using the Edit tool's replace approach. The `## Related files` heading and its content were replaced with: [three new sections + --- separator] + [updated ## Related files with AUR bullets appended]. This is a splice-then-update in a single edit operation.

## RELEASE_TOKEN Preservation

The `## RELEASE_TOKEN prerequisite` section and all content from lines 1–105 is byte-identical to before the edit. Confirmed by:
- The edit's `old_string` started at the `---` separator preceding `## Related files` (line 106 of original)
- All content above that line was untouched by the Edit tool

## File Statistics

| Metric | Before | After |
|--------|--------|-------|
| Lines | 111 | 211 |
| H2 headings (`## `) | 7 | 10 |
| New sections | — | +3 |

## Deviations from Plan

None — plan executed exactly as written. The three new H2 sections were spliced before `## Related files` and the existing `## Related files` section was rewritten with AUR bullets appended (matching the plan's Step B).

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. `docs/RELEASING.md` is a documentation file. The doc references `~/.ssh/aur_nsyte_ed25519` as a filename placeholder only — no real key material is embedded. T-22-09 (Information Disclosure) check passes: the only `BEGIN OPENSSH PRIVATE KEY` reference in the file is in instructional prose telling the maintainer what to copy-paste, not actual key material.

## Known Stubs

None. This plan is documentation-only; no UI components or data wiring is involved.

## Self-Check: PASSED

- [x] `docs/RELEASING.md` exists at expected path
- [x] Commit `ed4e8cd` exists in git log
- [x] All 15 grep-based acceptance criteria pass (verified before commit)
- [x] H2 count increased by exactly 3 (7 → 10)
- [x] No unintended file deletions in commit
- [x] RELEASE_TOKEN content preserved (edit started below line 106)
