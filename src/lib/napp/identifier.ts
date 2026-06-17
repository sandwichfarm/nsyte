/**
 * NIP-5B base-62 `+`-prefixed TLV app identifier (encode + decode).
 *
 * FAITHFUL PORT of the 44Billion/nappup reference (the spec's cited implementation).
 * Byte-for-byte INTEROP is the requirement here, NOT algorithmic elegance — do NOT
 * "improve" or normalize the algorithm. Any deviation breaks interop with every other
 * NIP-5B client. The shape of the port is fixed:
 *   - base62 alphabet order is `0-9a-zA-Z`
 *   - the byte array is treated as ONE big-endian bigint (whole-array, not per-byte)
 *   - each leading 0x00 byte becomes one leading '0' (LEADER) char, and vice versa
 *   - TLV type order is REVERSED before serialization (T2 pubkey, T1 relays, T0 dTag)
 *   - channel '+' => kind 35128 (main), '++' => 35129 (next), '+++' => 35130 (draft)
 *
 * nsyte scoping decision: nsyte publishes NAMED sites (kind 35128, channel main,
 * prefix "+"). A ROOT site (kind 15128) has NO `d` tag and is NOT in `kindByChannel`,
 * so it CANNOT be encoded — the `napp id` command rejects it (see src/commands/napp.ts).
 * Relay hints are optional; decode MUST tolerate zero relays.
 */
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

// ---------------------------------------------------------------------------
// base62 — verbatim port
// ---------------------------------------------------------------------------

export const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const BASE = 62n;
const LEADER = "0";

/**
 * Encode a byte array as a base62 string. The whole array is interpreted as one
 * big-endian bigint; leading 0x00 bytes are preserved as leading LEADER chars.
 */
export function bytesToBase62(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) {
    num = (num << 8n) + BigInt(b);
  }

  let out = "";
  while (num > 0n) {
    out = BASE62_ALPHABET[Number(num % BASE)] + out;
    num = num / BASE;
  }

  // Preserve each leading zero byte as one leader char.
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    out = LEADER + out;
  }

  return out;
}

/**
 * Decode a base62 string back to the original byte array. Leading LEADER chars are
 * restored as leading 0x00 bytes.
 */
export function base62ToBytes(str: string): Uint8Array {
  let leadingZeros = 0;
  while (leadingZeros < str.length && str[leadingZeros] === LEADER) {
    leadingZeros++;
  }

  let num = 0n;
  for (const ch of str.slice(leadingZeros)) {
    const idx = BASE62_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("invalid base62 char");
    num = num * BASE + BigInt(idx);
  }

  const tail: number[] = [];
  while (num > 0n) {
    tail.unshift(Number(num & 0xffn));
    num >>= 8n;
  }

  const out = new Uint8Array(leadingZeros + tail.length);
  out.set(tail, leadingZeros);
  return out;
}

// ---------------------------------------------------------------------------
// TLV — verbatim port (CRITICAL: type order is REVERSED before serialization)
// ---------------------------------------------------------------------------

/**
 * Serialize TLV values. Input is indexed: [0]=dTag values, [1]=relay values,
 * [2]=pubkey values. The [index, vals] pairs are REVERSED so the serialized byte
 * order becomes type 2 (pubkey), type 1 (relays), type 0 (dTag).
 */
function toTlv(values: Uint8Array[][]): Uint8Array {
  const pairs: Array<[number, Uint8Array[]]> = values.map((
    vals,
    index,
  ) => [index, vals]);
  pairs.reverse();

  const chunks: Uint8Array[] = [];
  for (const [type, vals] of pairs) {
    for (const value of vals) {
      if (value.length === 0) continue;
      if (value.length > 255) throw new Error("TLV value too long");
      chunks.push(Uint8Array.of(type, value.length, ...value));
    }
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Walk a serialized TLV buffer back into a `{ type: values[] }` map. */
function tlvToObj(bytes: Uint8Array): Record<number, Uint8Array[]> {
  const obj: Record<number, Uint8Array[]> = {};
  let i = 0;
  while (i + 1 < bytes.length) {
    const t = bytes[i];
    const l = bytes[i + 1];
    const v = bytes.slice(i + 2, i + 2 + l);
    i += 2 + l;
    (obj[t] ??= []).push(v);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

const kindByChannel = { main: 35128, next: 35129, draft: 35130 };
const prefixByChannel: Record<string, string> = {
  main: "+",
  next: "++",
  draft: "+++",
};
const channelByPrefix: Record<string, string> = {
  "+": "main",
  "++": "next",
  "+++": "draft",
};

// ---------------------------------------------------------------------------
// Low-level encode / decode
// ---------------------------------------------------------------------------

export function appEncode(
  ref: {
    dTag: string;
    pubkey: string;
    kind: number;
    relays?: string[];
    channel?: string;
  },
): string {
  const channel = ref.channel ||
    (Object.entries(kindByChannel).find(([, k]) => k === ref.kind)?.[0]);
  if (!channel) throw new Error("Wrong channel");
  if (ref.dTag.length > 260) throw new Error("dTag too long");

  const tlv = toTlv([
    [utf8ToBytes(ref.dTag)],
    (ref.relays ?? []).map(utf8ToBytes),
    [hexToBytes(ref.pubkey)],
  ]);

  return prefixByChannel[channel] + bytesToBase62(tlv);
}

export function appDecode(
  entity: string,
): { dTag: string; pubkey: string; relays: string[]; kind: number } {
  let prefixLen = 0;
  while (prefixLen < entity.length && entity[prefixLen] === "+") {
    prefixLen++;
  }
  const prefix = entity.slice(0, prefixLen);
  const channel = channelByPrefix[prefix];
  if (!channel) throw new Error("Wrong channel");

  const base62 = entity.slice(prefix.length);
  const tlv = tlvToObj(base62ToBytes(base62));

  // TLV types 0 (dTag) and 2 (pubkey) are REQUIRED. Guard before indexing so a malformed
  // identifier yields a clear validation error rather than a raw TypeError on `tlv[t][0]`.
  if (!tlv[0]?.[0]) throw new Error("invalid app identifier: missing d tag (TLV type 0)");
  if (!tlv[2]?.[0]) throw new Error("invalid app identifier: missing pubkey (TLV type 2)");

  const dTag = bytesToUtf8(tlv[0][0]);
  const pkBytes = tlv[2][0];
  if (pkBytes.length !== 32) throw new Error("invalid pubkey length");
  const pubkey = bytesToHex(pkBytes);
  const relays = (tlv[1] ?? []).map(bytesToUtf8);
  const kind = kindByChannel[channel as keyof typeof kindByChannel];

  if (dTag.length > 260) throw new Error("dTag too long");

  return { dTag, pubkey, relays, kind };
}

// ---------------------------------------------------------------------------
// High-level wrappers (nsyte-facing API — default channel main / kind 35128)
// ---------------------------------------------------------------------------

export function nappIdentifier(
  ref: { dTag: string; pubkey: string; relays?: string[] },
): string {
  return appEncode({
    dTag: ref.dTag,
    pubkey: ref.pubkey,
    kind: kindByChannel.main,
    relays: ref.relays ?? [],
  });
}

export function decodeNappIdentifier(entity: string) {
  return appDecode(entity);
}

// ---------------------------------------------------------------------------
// Indexer relays (NAPP-ID-03)
// ---------------------------------------------------------------------------

export const DEFAULT_NAPP_INDEXER_RELAYS = ["wss://relay.44billion.net"];

/**
 * Resolve the indexer relays an App Listing is published to. Returns the configured
 * `napp.indexerRelays` array when it is a non-empty array, otherwise the default.
 * Tolerates a non-object / non-napp config (returns the default).
 */
export function resolveIndexerRelays(
  config: { napp?: { indexerRelays?: string[] } } | unknown,
): string[] {
  if (typeof config !== "object" || config === null) {
    return DEFAULT_NAPP_INDEXER_RELAYS;
  }
  const napp = (config as { napp?: { indexerRelays?: string[] } }).napp;
  const indexerRelays = napp?.indexerRelays;
  if (Array.isArray(indexerRelays) && indexerRelays.length > 0) {
    return indexerRelays;
  }
  return DEFAULT_NAPP_INDEXER_RELAYS;
}
