# Requirements: nsyte

**Defined:** 2026-04-14
**Core Value:** Reliable site deployment to the nostr + blossom ecosystem with a simple CLI workflow.

## v1.2 Requirements

Requirements for Custom Event Timestamps milestone. Each maps to roadmap phases.

### CLI Argument

- [x] **CLI-01**: User can pass `--created-at <value>` as a global CLI option to any command
- [x] **CLI-02**: Accepts Unix epoch seconds (e.g. `--created-at 1700000000`)
- [x] **CLI-03**: Accepts ISO 8601 datetime strings (e.g. `--created-at 2024-01-15T12:00:00Z`)
- [x] **CLI-04**: Invalid timestamp values produce a clear error message

### Timestamp Propagation

- [ ] **PROP-01**: Override applies to site manifest events (kinds 15128, 35128)
- [ ] **PROP-02**: Override applies to snapshot events (kind 5128)
- [ ] **PROP-03**: Override applies to profile events (kind 0)
- [ ] **PROP-04**: Override applies to relay list events (kind 10002)
- [ ] **PROP-05**: Override applies to server list events (kind 10063)
- [ ] **PROP-06**: Override applies to app handler events (kind 31990)
- [ ] **PROP-07**: Override applies to app recommendation events (kind 31989)
- [ ] **PROP-08**: Delete events (kind 5) are excluded from override -- deletion should reflect actual time
- [ ] **PROP-09**: Blossom auth events (kind 24242) are excluded from override -- expiration logic depends on current time

### Testing

- [ ] **TEST-01**: Unit tests for timestamp parsing (Unix and ISO 8601)
- [ ] **TEST-02**: Unit tests for timestamp propagation to each event type
- [ ] **TEST-03**: Unit tests confirming delete events and auth events are excluded from override

## Future Requirements

(None -- this is a focused milestone)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Config file timestamp setting | A static timestamp in config makes no sense -- CLI arg only |
| Per-command different timestamps | Overcomplicates; single global arg is sufficient |
| Relative time expressions (e.g. "1 hour ago") | Unnecessary complexity; Unix/ISO covers all use cases |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01 | Phase 7 | Complete |
| CLI-02 | Phase 7 | Complete |
| CLI-03 | Phase 7 | Complete |
| CLI-04 | Phase 7 | Complete |
| PROP-01 | Phase 8 | Pending |
| PROP-02 | Phase 8 | Pending |
| PROP-03 | Phase 8 | Pending |
| PROP-04 | Phase 8 | Pending |
| PROP-05 | Phase 8 | Pending |
| PROP-06 | Phase 8 | Pending |
| PROP-07 | Phase 8 | Pending |
| PROP-08 | Phase 8 | Pending |
| PROP-09 | Phase 8 | Pending |
| TEST-01 | Phase 9 | Pending |
| TEST-02 | Phase 9 | Pending |
| TEST-03 | Phase 9 | Pending |

**Coverage:**
- v1.2 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-04-14*
*Last updated: 2026-04-14 after roadmap creation*
