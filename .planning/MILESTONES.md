# Milestones

## v1.0 nsyte Agent Skills (Shipped: 2026-02-24)

**Phases completed:** 5 phases, 9 plans
**Delivered:** Six spec-compliant Agent Skills enabling AI agents to discover and use nsyte end-to-end — from installation through deployment and configuration — without prior knowledge.

**Key accomplishments:**
- Six Agent Skills (nsyte-setup, nsyte-deploy, nsyte-config, nsyte-auth, nsyte-ci, nsyte-concepts) all passing `skills-ref validate`
- End-to-end agent workflow: discover nsyte, install it, initialize a project, deploy to Nostr network
- Shared Nostr/Blossom vocabulary reference with relay, pubkey, NIP-46, and Blossom concepts
- Pre-flight validation scripts (check-deno.ts, check-network.ts) for runtime and network prerequisites
- CI/CD deployment support with ephemeral credentials via `nsyte ci` and `--sec` flag
- Full spec compliance: all skills under 500-line budget, third-person descriptions with Nostr context vocabulary

**Tech debt accepted:**
- nsyte-deploy/SKILL.md line 194 points to README.md which uses nonexistent `--nbunksec` flag
- REQUIREMENTS.md used stale skill names (nsyte-install/nsyte-init vs nsyte-setup) — planning artifact only

**Archive:** `.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`, `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

---
