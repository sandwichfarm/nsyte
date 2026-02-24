---
name: nsyte-concepts
description: Background knowledge about Nostr protocol, Blossom blob storage, pubkeys, relays, and NIP-46 bunker authentication used by nsyte. Loaded automatically when Nostr or Blossom domain context is needed during nsyte operations.
metadata:
  user-invocable: false
---

## Purpose

This skill provides background Nostr and Blossom domain knowledge for agents working with nsyte.
It is auto-loaded as context when Nostr or Blossom concepts are relevant — it is not invoked
directly by users.

## Content

The primary content is in `references/nostr-concepts.md`. That file defines:

- **Relay** — WebSocket servers (`wss://`) that store and serve Nostr events; required for site
  metadata announcements
- **Pubkey** — The user's public identifier on Nostr; stored in `.nsite/config.json`
- **nsec / Private Key** — The secret used to sign events; must never be logged or committed
- **Blossom Server** — HTTP blob storage (`https://`) for site files; addressed by SHA-256 hash
- **NIP-46 / Bunker Auth** — Remote signing protocol; preferred for CI/CD (keeps private key off
  deploy machine)
- **Nostr Event** — Signed JSON object; the fundamental data unit on Nostr; nsyte creates and
  publishes events automatically

## Usage for Agents

When you encounter Nostr or Blossom terminology (relay, pubkey, nsec, Blossom, bunker) while
helping with nsyte tasks, refer to `references/nostr-concepts.md` for authoritative definitions.
Do not inline these definitions into other skill bodies — link to this file instead.
