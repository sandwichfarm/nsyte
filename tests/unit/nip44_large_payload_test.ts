import { assertEquals } from "@std/assert";
import * as nip44 from "npm:nostr-tools/nip44";
import { generateSecretKey, getPublicKey } from "npm:nostr-tools/pure";

/**
 * NIP-46 wraps every request to a remote signer in a NIP-44 payload, so the
 * largest event nsyte can have a bunker sign is bounded by NIP-44's plaintext
 * limit. NIP-44 v2 raised that to 2^32-1 bytes with a 6-byte extended length
 * prefix (`[0x00, 0x00][u32]`) for anything >= 65536; before that it was
 * capped at 65535.
 *
 * A site manifest (kind 35128) carries one `path` tag per file, so a site of a
 * few hundred files clears 64 KiB easily -- a 1117-file site produces a
 * ~141 KB event. Against an implementation that still enforces the old cap,
 * every such deploy fails at the last step with "invalid plaintext size: must
 * be between 1 and 65535 bytes", after the upload has already happened.
 *
 * This guards the resolved nostr-tools version rather than code in this repo:
 * a lockfile that drifts back to a pre-extended-prefix release reintroduces
 * the failure silently.
 */
Deno.test("NIP-44 round-trips payloads larger than the old 65535-byte cap", () => {
  const conversationKey = nip44.getConversationKey(
    generateSecretKey(),
    getPublicKey(generateSecretKey()),
  );

  // 65535 is the last size the 2-byte u16 prefix covers; 65536 is the first
  // that needs the extended prefix, and is where the old implementation threw.
  // 141397 is the size of a real 1117-file manifest.
  for (const size of [65535, 65536, 141397]) {
    const plaintext = "a".repeat(size);
    const decrypted = nip44.decrypt(nip44.encrypt(plaintext, conversationKey), conversationKey);
    assertEquals(decrypted.length, size, `NIP-44 failed to round-trip ${size} bytes`);
    assertEquals(decrypted, plaintext);
  }
});
