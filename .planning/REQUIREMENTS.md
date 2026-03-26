# Requirements: nsyte

**Defined:** 2026-03-26
**Core Value:** Users can deploy and manage static websites on nostr with a single CLI command

## v0.24.0 Requirements

Requirements for NIP-5A named sites compliance. Each maps to roadmap phases.

### URL Resolution

- [ ] **URL-01**: Named site URLs use base36-encoded pubkey (50 chars) concatenated with dTag in a single DNS label
- [ ] **URL-02**: Gateway/resolver parses `<pubkeyB36><dTag>` single-label hostname format to extract pubkey and identifier
- [ ] **URL-03**: Old npub-based named site URL format (`<identifier>.<npub>`) removed entirely

### Validation

- [ ] **VAL-01**: dTag validated against `^[a-z0-9-]{1,13}$` and rejects trailing hyphens
- [ ] **VAL-02**: Deploy command errors if named site identifier fails NIP-5A validation

### Manifest

- [ ] **MAN-01**: Manifest supports optional `source` tag for repository URL (http/https)
- [ ] **MAN-02**: Gateway serves `/404.html` fallback when no matching path found per NIP-5A spec

### Documentation

- [ ] **DOC-01**: `nsite-nip.md` renamed to `NIP-5A.md` and updated to match published specification

## Future Requirements

None identified for this milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backward compat with old npub URL format | NIP-5A is final; clean break from draft format |
| Config migration for non-compliant dTags | No migrations from old format; future changes will get migration support |
| Root site (kind 15128) changes | Root sites are unaffected by NIP-5A changes |
| New commands or major features | This milestone is spec compliance only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| URL-01 | Phase 1 | Pending |
| VAL-01 | Phase 1 | Pending |
| URL-02 | Phase 2 | Pending |
| URL-03 | Phase 2 | Pending |
| MAN-02 | Phase 2 | Pending |
| VAL-02 | Phase 3 | Pending |
| MAN-01 | Phase 3 | Pending |
| DOC-01 | Phase 3 | Pending |

**Coverage:**
- v0.24.0 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after roadmap creation*
