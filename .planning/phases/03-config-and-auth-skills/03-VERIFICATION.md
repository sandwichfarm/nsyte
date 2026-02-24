---
phase: 03-config-and-auth-skills
verified: 2026-02-24T12:00:00Z
status: passed
score: 6/6 must-haves verified
gaps: []
---

# Phase 3: Config and Auth Skills Verification Report

**Phase Goal:** An agent can manage nsyte configuration, set up NIP-46 bunker authentication, and configure non-interactive CI/CD deployment — without ambiguity between the interactive and non-interactive code paths
**Verified:** 2026-02-24T12:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent can learn how to read and modify nsyte project configuration using nsyte-config skill | VERIFIED | `.agents/skills/nsyte-config/SKILL.md` has complete body (147 lines), covers TUI editing, keyboard reference, schema reference, validation, and programmatic path |
| 2 | Agent understands that nsyte config requires an interactive terminal (TTY) | VERIFIED | Section "Interactive Config Editing" opens with explicit TTY constraint warning and the error message text |
| 3 | Agent knows how to validate config without a TTY using nsyte validate | VERIFIED | "Scriptable Validation" section covers `nsyte validate`, alias, `--file`, `--schema` flags, exit codes, and example output |
| 4 | Agent can identify all config schema fields and their purposes | VERIFIED | Full schema reference table covering required, auth, identity, publishing, gateway, profile, appHandler, and editor fields |
| 5 | Agent can guide a user through connecting a NIP-46 bunker to nsyte | VERIFIED | `.agents/skills/nsyte-auth/SKILL.md` has complete body (119 lines) covering QR code and bunker URL methods, shell quoting requirement, project linking, subcommand table, secrets storage, and troubleshooting |
| 6 | Agent knows both bunker connection methods: QR code scan and bunker URL | VERIFIED | "Connecting a Bunker" section explicitly documents Method 1 (QR/Nostr Connect) and Method 2 (bunker URL with single-quote requirement) |
| 7 | Agent can guide setting up CI/CD deployment with ephemeral credentials | PARTIAL | `.agents/skills/nsyte-ci/SKILL.md` body is correct and complete, but the frontmatter `description` field references `--ci flag` which does not exist in nsyte. The correct flag is `--non-interactive`. Agents use the description for skill discovery — this creates a factual inaccuracy at the entry point. |
| 8 | Agent knows nsyte ci generates a one-time nbunksec that is never stored to disk | VERIFIED | Step 1 has explicit CRITICAL warning: "The nbunksec1... string is printed once and never stored to disk. Copy it immediately." |
| 9 | Agent understands that --sec (not --nbunksec) is the correct deploy flag | VERIFIED | Step 2 has explicit CRITICAL warning: "Use --sec (NOT --nbunksec — that flag does not exist despite appearing in the README)" |
| 10 | Interactive auth setup (nsyte-auth) and non-interactive CI deploy (nsyte-ci) instructions do not overlap | VERIFIED | nsyte-auth has zero CI/pipeline content (no --non-interactive, no `nsyte ci`, no GitHub Actions); nsyte-ci has zero interactive bunker management content (no bunker connect/import/export/use/list/remove) |

**Score:** 9/10 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.agents/skills/nsyte-config/SKILL.md` | Complete config management skill body | VERIFIED | 147 lines, substantive content, cross-references nsyte-concepts and nsyte-auth |
| `.agents/skills/nsyte-auth/SKILL.md` | Complete NIP-46 bunker auth skill body | VERIFIED | 119 lines, substantive content, cross-references nsyte-config and nsyte-concepts |
| `.agents/skills/nsyte-ci/SKILL.md` | Complete CI/CD deployment skill body | PARTIAL | 89 lines, body is substantive and correct; frontmatter description names non-existent `--ci flag` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| nsyte-config/SKILL.md | nsyte-concepts | cross-reference for domain vocabulary | WIRED | "see the `nsyte-concepts` skill" in Prerequisites |
| nsyte-config/SKILL.md | nsyte-auth/SKILL.md | cross-reference for bunkerPubkey field | WIRED | "See the `nsyte-auth` skill" appears 4 times in relevant sections |
| nsyte-auth/SKILL.md | nsyte-config/SKILL.md | cross-reference for bunkerPubkey in config | WIRED | "see `nsyte-config` skill" in Prerequisites |
| nsyte-auth/SKILL.md | nsyte-concepts | cross-reference for NIP-46 vocabulary | WIRED | "see the `nsyte-concepts` skill" in Prerequisites |
| nsyte-ci/SKILL.md | nsyte-deploy/SKILL.md | cross-reference for deploy command usage | WIRED | "see `nsyte-deploy` skill for config requirements" in Prerequisites |
| nsyte-ci/SKILL.md | nsyte-auth/SKILL.md | cross-reference for initial bunker setup before CI | WIRED | "see `nsyte-auth` skill for how to set up a bunker" in Prerequisites |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CONF-01 | 03-01-PLAN.md | Agent can manage nsyte configuration and settings via `nsyte-config` skill | SATISFIED | nsyte-config/SKILL.md exists with complete body; covers TUI, schema, validation, and programmatic editing |
| CONF-02 | 03-02-PLAN.md | Agent can set up non-interactive CI/CD deployment via `nsyte-ci` skill | PARTIAL | nsyte-ci/SKILL.md body is complete and accurate; frontmatter description references non-existent `--ci flag` |
| CONF-03 | 03-02-PLAN.md | Agent can guide NIP-46 bunker auth setup via dedicated `nsyte-auth` skill | SATISFIED | nsyte-auth/SKILL.md exists with complete body covering both connection methods, subcommand reference, and secrets storage |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.agents/skills/nsyte-ci/SKILL.md` | 3 | Frontmatter description: "the --ci flag" — flag does not exist in nsyte source | Warning | Agents selecting skills based on description will encounter a factual inaccuracy before reading the body |

No placeholder/stub content found in any of the three skill files.
No `nsyte login` references found in any file.
The `--nbunksec` occurrence in nsyte-ci line 47 is a warning statement ("NOT --nbunksec — that flag does not exist"), not a usage instruction. This is correct and intentional per the plan.

### Human Verification Required

None required. All content is documentation-only and verifiable via static analysis.

### Gaps Summary

One gap found. The nsyte-ci skill body is substantively correct and covers all required content: credential generation via `nsyte ci`, the one-time nbunksec behavior, the `--sec` flag (not `--nbunksec`), a GitHub Actions example, and a pre-flight checklist.

However, the frontmatter `description` field — the first thing an agent reads when selecting skills — contains a factual error:

```
description: Configures nsyte for non-interactive CI/CD deployment using environment variable
authentication and the --ci flag.
```

There is no `--ci` flag in nsyte. Verified against `src/commands/deploy.ts` which defines `-i, --non-interactive`. The description should reference `--non-interactive` instead.

This is a single-line fix. The body content is correct and satisfies the CI/CD workflow requirements end-to-end.

**Root cause:** The frontmatter description was not updated to match the plan's guidance that `--sec` and `--non-interactive` are the correct flags, not `--nbunksec` or `--ci`.

---

_Verified: 2026-02-24T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
