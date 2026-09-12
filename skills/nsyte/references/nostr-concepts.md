# Nostr Concepts Reference

Agent-readable definitions of the Nostr protocol, Blossom storage, and authentication concepts that
nsyte commands rely on. Written for agents with no prior Nostr knowledge.

---

## Relay

A relay is a WebSocket server identified by a `wss://` URL. Relays receive signed Nostr events,
store them, and serve them to clients on request. Relays are independent — an event published to one
relay is not automatically available on another, which is why nsyte publishes to several.

nsyte publishes the site manifest (and optional metadata events) to every relay in the config so
gateways and clients can discover the site.

**For agents:** Relay URLs live in `.nsite/config.json` under `relays`. Read the config before
suggesting relays; do not invent URLs. If the array is empty, suggest `wss://relay.damus.io`,
`wss://nos.lol`, and `wss://relay.nsite.lol` (nsyte's own defaults). Commands accept
`-r, --relays a,b,c` to override for one run and `--use-fallback-relays` to add the built-in
defaults. A relay list of `NIP-65` kind 10002 lets other clients find the user's preferred relays.

**Format:** `wss://relay.example.com`

---

## Pubkey / npub

A pubkey (public key) identifies a Nostr user. It is a 64-character lowercase hex string derived
from the user's private key, and can also be written in bech32 as `npub1…`. Public keys are safe to
share and appear in gateway URLs (`https://<npub>.nsite.lol/`).

nsyte signs every event with the user's key, so the pubkey is what ties a site to its owner. A
`NIP-05` identifier (`name@domain.com`) can resolve to a pubkey; nsyte accepts it wherever
`-p, --pubkey` is allowed.

**For agents:** The config does **not** store the user's own pubkey. When a bunker is used, the
config stores `bunkerPubkey` — the hex pubkey of the remote signer, set by `nsyte bunker use`. To
find "my pubkey", read it from `nsyte deploy` output, `nsyte sites`, or `nsyte bunker list`. Never
confuse a pubkey (public) with an nsec/private key (secret).

**Formats:** 64 hex chars, `npub1…`, or `name@domain.com` (NIP-05).

---

## nsec / Private Key

The private key (`nsec1…` bech32, or 64 hex chars) signs events. Anyone holding it fully controls
the identity. nsyte never writes private keys to `.nsite/config.json` and does not persist keys
entered during `nsyte init`; they are only used for the current run.

**For agents:** NEVER print, log, echo, commit, or paste a private key into a visible command line
(shell history captures arguments). Pass it from an environment variable — `--sec "$NSEC"` — or use
`--prompt-sec` so nsyte prompts for it. If you see an `nsec1…` or a bare 64-hex string in a file
that is not an encrypted store, flag it as a security problem and recommend rotating the key. For
long-term or automated use, steer the user to NIP-46 bunker auth instead.

**Formats:** `nsec1…` or 64 hex chars — never include real values in documentation or output.

---

## Blossom Server

A Blossom server is an HTTP(S) server that stores arbitrary files ("blobs") addressed by their
SHA-256 hash. nsyte uploads every site file to each configured Blossom server; because the address
is the hash, identical content is deduplicated and integrity is verifiable by anyone.

The site manifest event lists each file path with its SHA-256 hash, so a gateway can fetch the right
blob from any server that has it. The optional kind 10063 event publishes the user's preferred
Blossom servers so clients know where to look.

**For agents:** Server URLs live in `.nsite/config.json` under `servers` and use `https://` (not
`wss://`). If empty, suggest `https://blossom.primal.net` and `https://cdn.hzrd149.com`. Servers may
reject uploads (size limits, allow-lists, payment) — nsyte keeps going as long as at least one
server accepts, and `nsyte status` shows per-server availability. `--sync` re-checks every server
and fills in missing blobs. Blob deletion (`delete --include-blobs`, `undeploy`) is best-effort;
servers are not obliged to honor it.

**Format:** `https://blossom.example.com`

---

## NIP-46 / Bunker Auth

NIP-46 ("Nostr Connect") is remote signing. The private key stays inside a signer app (Amber,
nsec.app, or another NIP-46 signer); nsyte connects to it over a relay using a `bunker://` URI and
asks it to sign each event. The key never touches the machine running nsyte.

nsyte stores the bunker connection (as an `nbunksec1…` credential) in a platform-selected secrets
backend — native keychain when available, otherwise an AES-256-GCM encrypted file, and as a last
resort plain-text JSON with a logged warning — and records the signer's pubkey in the config as
`bunkerPubkey`. Do not assume the credential is keychain-protected; on a headless Linux box without
`secret-tool` it is in the encrypted file (or plain text if that failed). `nsyte ci` produces an
`nbunksec1…` for CI without storing it locally.

**For agents:** Setup is `nsyte bunker connect '<bunker://…>'` (or interactive QR) followed by
`nsyte bunker use <pubkey>`. Always single-quote `bunker://` URIs. If auth fails in CI, check that
the pipeline passes `--sec "$NBUNK_SECRET"` and that the signer app is online and reachable on the
relay named in the URI. Do not offer pasting a private key as the "easy" alternative.

**Example URI (placeholders):**
`bunker://<signer-pubkey>?relay=wss://relay.example.com&secret=<token>`

---

## Nostr Event and Kinds

An event is a signed JSON object — the unit of data on Nostr. Events carry a `kind` number that says
what they mean, a `pubkey`, `created_at`, `tags`, `content`, and a signature. Events cannot be
edited; "updating" means publishing a newer event that clients prefer (replaceable kinds) or a
delete request (kind 5, NIP-09) that relays may honor.

Kinds nsyte publishes:

| Kind    | Meaning                                           | Published by                               |
| ------- | ------------------------------------------------- | ------------------------------------------ |
| `15128` | Root site manifest (one per pubkey)               | `deploy`, `put`                            |
| `35128` | Named site manifest (`d` tag = site `id`, NIP-5A) | `deploy -d`, `put -n`                      |
| `5128`  | Immutable snapshot of a manifest                  | `snapshot`                                 |
| `0`     | Profile metadata (root sites only)                | `deploy --publish-profile`                 |
| `10002` | Relay list, NIP-65 (root sites only)              | `deploy --publish-relay-list`              |
| `10063` | Blossom server list (root sites only)             | `deploy --publish-server-list`             |
| `31990` | NIP-89 app handler announcement                   | `deploy --publish-app-handler`, `announce` |
| `31989` | NIP-89 app recommendation                         | `announce --publish-app-recommendation`    |
| `5`     | NIP-09 delete request                             | `delete`, `undeploy`                       |

**For agents:** You never construct events by hand — nsyte builds and signs them. To see exactly
what would be published, use `--dry-run` (writes each event as JSON to a directory) and
`--dry-run-show-kinds 15128,31990` to print specific kinds. `--created-at` overrides the timestamp
for reproducible publishes. To check what is live, use `nsyte status`, `nsyte debug --show-events`,
or `nsyte sites`.

---

## Root vs Named Sites (NIP-5A)

Each pubkey has one **root site** (kind 15128, served at `https://<npub>.<gateway>/`) and any number
of **named sites** (kind 35128, identified by `id`, served at
`https://<base36-pubkey><id>.<gateway>/`). The `id` must match `[a-z0-9-]{1,13}`.

**For agents:** `id` is set in `.nsite/config.json`, or per run with `-d, --name <id>` on most
commands (`-n, --name` on `put`). Profile, relay-list, and server-list publishing are only allowed
from the root site; `nsyte validate` and `nsyte deploy` reject them on named sites.
