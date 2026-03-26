# nsyte

## What This Is

A command-line tool for publishing nsites (decentralized, censorship-resistant static websites) to nostr relays and Blossom blob servers. Users deploy web content via CLI, with files stored as blobs on Blossom servers and manifests published as nostr events. Built with Deno/TypeScript.

## Core Value

Users can deploy and manage static websites on nostr with a single CLI command, using the nsite protocol for decentralized hosting.

## Requirements

### Validated

- Deploy static sites to nostr relays and Blossom servers (root and named sites)
- NIP-46 bunker authentication and private key auth
- Secure credential storage (OS keychain, encrypted file, fallback)
- CI/CD support with nbunksec strings
- List, browse, download, delete, and undeploy published sites
- Local development server (`serve`) and resolver server (`run`)
- Debug command for diagnosing nsite issues
- NIP-89 app handler support
- `.nsyte-ignore` file support
- Config validation with JSON schema

### Active

- [ ] Base36 pubkey encoding/decoding for named site URLs per NIP-5A
- [ ] dTag validation enforcing `^[a-z0-9-]{1,13}$` (no trailing hyphen)
- [ ] Gateway/resolver updated to parse `<pubkeyB36><dTag>` hostname format
- [ ] `source` tag support in config and manifest events
- [ ] `/404.html` fallback path per NIP-5A spec
- [ ] Deploy validation ensuring named site identifiers are NIP-5A compliant
- [ ] Internal nsite-nip.md updated to match published NIP-5A

### Out of Scope

- Changing root site (kind 15128) behavior — unaffected by NIP-5A changes
- Re-architecting deploy pipeline — only named site compliance changes needed
- New commands or major feature additions — this milestone is spec compliance only

## Current Milestone: v0.24.0 NIP-5A Named Sites Compliance

**Goal:** Update nsyte to comply with the published NIP-5A specification for named sites, fixing the broken named sites functionality.

**Target features:**
- Base36 pubkey encoding/decoding for named site URLs
- dTag validation (^[a-z0-9-]{1,13}$, no trailing hyphen)
- Updated gateway/resolver to parse new `<pubkeyB36><dTag>` hostname format
- `source` tag support in config and manifest
- `/404.html` fallback path per spec
- Updated internal nsite-nip.md to match NIP-5A
- Validation in deploy to ensure named site identifiers are NIP-5A compliant

## Context

- Project at v0.23.0, Deno 2+ runtime
- Named sites are currently broken — gateways adopted NIP-5A's new URL format (`<pubkeyB36><dTag>` single DNS label) but nsyte still uses old `<identifier>.<npub>` format
- Root sites (kind 15128) work fine with current gateways
- The key NIP-5A change: named site URLs use base36-encoded 32-byte pubkey (always 50 chars) concatenated directly with dTag (no separator), forming a single DNS label
- dTag constrained to `^[a-z0-9-]{1,13}$` due to 63-char DNS label limit minus 50-char base36 pubkey
- Uses applesauce-* libraries for nostr event handling

## Constraints

- **Spec compliance**: Must match published NIP-5A exactly — gateways are already enforcing it
- **Backward compat**: Existing root site deployments must continue working
- **Deno runtime**: All code must be Deno-compatible TypeScript
- **No breaking config**: Existing `.nsite/config.json` files should still work (may need migration for invalid dTags)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Focus on named sites only | Root sites are unaffected by NIP-5A changes | -- Pending |
| Validate dTag on deploy | Catch invalid identifiers early rather than at gateway | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after milestone v0.24.0 initialization*
