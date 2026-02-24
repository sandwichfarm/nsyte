# Nostr Concepts Reference

Agent-readable definitions of Nostr protocol, Blossom storage, and authentication concepts used by nsyte commands. Written for agents with no prior Nostr knowledge.

---

## Relay

A relay is a WebSocket server identified by a `wss://` URL. Relays receive and store signed Nostr events and serve them to clients on request.

nsyte publishes site metadata events to one or more relays so that Nostr clients can discover a user's site. Without relays configured, nsyte cannot announce site updates to the network.

**For agents:** Relay URLs are stored in `.nsite/config.json` under the `relays` array. If a user has not configured any relays, ask them to add at least one. You may suggest `wss://relay.damus.io` and `wss://nos.lol` as widely-available public relays. To add a relay interactively the user runs `nsyte config` and follows the prompts. Never hard-code relay URLs from user configurations into documentation or instructions — always read from `.nsite/config.json`.

**Example format:** `wss://relay.example.com`

---

## Pubkey

A pubkey (public key) is the primary identifier for a Nostr user. It is a 64-character lowercase hexadecimal string derived from the user's private key. It may also be represented in bech32 encoding as an `npub1...` string.

nsyte uses the pubkey to identify site ownership. The pubkey is associated with every event the user publishes, so Nostr clients know which site belongs to which user.

**For agents:** The pubkey is stored in `.nsite/config.json` under the `pubkey` field. Do not confuse pubkey (public, safe to share) with nsec/private key (secret, must never be exposed). If the config is missing a pubkey, the user must run `nsyte init` or `nsyte bunker add` to establish an identity. Always use the value from config — never ask the user to type their pubkey manually.

**Example format:** `a1b2c3d4e5f6...` (64 hex chars) or `npub1abc...` (bech32)

---

## nsec / Private Key

An nsec (Nostr secret key) or private key is the cryptographic secret that allows a user to sign Nostr events. It is a 64-character hex string or a bech32-encoded string starting with `nsec1`. Anyone who has the private key has full control of the associated Nostr identity.

**For agents:** NEVER log, print, commit to source control, or pass the private key as a visible CLI argument. Shell history can capture CLI arguments — advise the user to use `nsyte init` for interactive key setup rather than passing the key as a flag. nsyte stores keys securely via the OS keychain or an encrypted fallback at `.nsite/.secrets.enc`. If a user needs to authenticate, direct them to `nsyte init` (interactive) or NIP-46 bunker auth for non-interactive environments. If you see what looks like an nsec or 64-char hex key in any file other than an encrypted store, flag it as a security concern.

**Example format:** `nsec1abc...` (bech32) or a 64-character hex string — never include real values in documentation.

---

## Blossom Server

A Blossom server is an HTTP/HTTPS file storage server that stores arbitrary binary files (blobs) addressed by their SHA-256 hash. nsyte uploads all static site files (HTML, CSS, JS, images) to one or more Blossom servers. File integrity is guaranteed by the hash — the same content always has the same address.

nsyte publishes Nostr events that list the SHA-256 hashes of all uploaded files, creating a content-addressed manifest that links site files to the user's Nostr identity.

**For agents:** Blossom server URLs are stored in `.nsite/config.json` under the `servers` array. If a user has not configured any Blossom servers, ask them to add at least one. You may suggest `https://blossom.primal.net` as a well-known public Blossom server. To add a server interactively the user runs `nsyte config`. Never assume default servers exist — always check config first. Blossom server URLs use `https://` (not `wss://`).

**Example format:** `https://blossom.example.com`

---

## NIP-46 / Bunker Auth

NIP-46 is a Nostr protocol extension for remote signing. Instead of holding a private key locally, a client (nsyte) connects to a remote signer via a `bunker://` URI. The signer holds the private key and approves each signing request. The private key never touches the machine running nsyte.

This is the preferred authentication method for CI/CD pipelines and non-interactive environments because it avoids storing private keys in environment variables, files, or shell history.

**For agents:** To set up bunker auth the user runs `nsyte bunker add <connection-string>` where the connection string is a `bunker://` URI provided by their Nostr signer app (e.g., Nsec.app, Amber, or another NIP-46-compatible signer). Once configured, nsyte uses bunker auth automatically for subsequent commands. If a user reports authentication errors in CI, check whether a bunker connection is configured before suggesting other approaches. Do not ask the user to paste their private key as an alternative — bunker auth is specifically designed to avoid that.

**Example bunker URI format:** `bunker://pubkey@relay.example.com?secret=token` (all values are placeholders)

---

## Nostr Event

A Nostr event is a signed JSON object — the fundamental unit of data on the Nostr network. Every piece of information published to Nostr (messages, site metadata, file references, profile data) is an event. Events are signed with the publisher's private key, making them tamper-evident and attributable. Once published, events are immutable; updating means publishing a new event.

Events have a `kind` number that categorizes their purpose (e.g., kind 1 for text notes, kind 10063 for Blossom file references). nsyte publishes events of specific kinds to announce site files and metadata.

**For agents:** You do not need to construct or parse Nostr events manually — nsyte handles all event creation and signing. If a user asks about their "events" or "event history", they are asking about data nsyte has published on their behalf. If a deployment appears to have failed silently, check whether events were published by looking at relay output or using a Nostr explorer with the user's pubkey. Never attempt to modify or re-sign events — republish via `nsyte deploy` instead.
