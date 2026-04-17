import { assertEquals } from "@std/assert";
import { beforeAll, describe, it } from "@std/testing/bdd";
import { SimpleSigner } from "applesauce-signers";
import { encodeHex } from "@std/encoding/hex";
import { createDeleteEvent } from "../../src/lib/nostr.ts";

let signer: SimpleSigner;

beforeAll(async () => {
  const privKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(privKeyBytes);
  signer = new SimpleSigner(encodeHex(privKeyBytes));
  await signer.getPublicKey();
});

describe("timestamp exclusion", () => {
  describe("createDeleteEvent (kind 5)", () => {
    it(
      "always uses current time, not a custom override",
      { sanitizeOps: false, sanitizeResources: false },
      async () => {
        const now = Math.floor(Date.now() / 1000);
        const event = await createDeleteEvent(signer, ["a".repeat(64)]);
        assertEquals(Math.abs(event.created_at - now) <= 5, true);
        assertEquals(event.kind, 5);
      },
    );

    it(
      "ignores an extra createdAt-like argument at runtime",
      { sanitizeOps: false, sanitizeResources: false },
      async () => {
        const now = Math.floor(Date.now() / 1000);
        const overriddenCreatedAt = 1;
        const createDeleteEventWithExtraArg = createDeleteEvent as unknown as (
          signer: SimpleSigner,
          eventIds: string[],
          createdAt: number,
        ) => Promise<{ created_at: number; kind: number }>;
        const event = await createDeleteEventWithExtraArg(
          signer,
          ["a".repeat(64)],
          overriddenCreatedAt,
        );

        assertEquals(Math.abs(event.created_at - now) <= 5, true);
        assertEquals(event.created_at === overriddenCreatedAt, false);
        assertEquals(event.kind, 5);
      },
    );
  });
});
