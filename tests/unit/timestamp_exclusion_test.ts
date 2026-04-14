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
  // Ensure signer is ready by resolving the public key
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

    it("does not accept a createdAt parameter", () => {
      // Function arity: signer + eventIds only (no third parameter)
      assertEquals(createDeleteEvent.length, 2);
    });
  });

  describe("blossom auth events (kind 24242)", () => {
    it("blossom.ts has no createdAt parameter in auth functions", () => {
      const blossomPath = new URL("../../src/lib/blossom.ts", import.meta.url).pathname;
      const source = Deno.readTextFileSync(blossomPath);
      assertEquals(
        source.includes("createdAt"),
        false,
        "blossom.ts must not contain a createdAt parameter",
      );
    });

    it("blossom.ts auth template uses hardcoded current time", () => {
      const blossomPath = new URL("../../src/lib/blossom.ts", import.meta.url).pathname;
      const source = Deno.readTextFileSync(blossomPath);
      assertEquals(
        source.includes("Math.floor(Date.now() / 1000)"),
        true,
        "blossom.ts must use Math.floor(Date.now() / 1000) for inline current time",
      );
    });
  });

  describe("upload auth events (kind 24242)", () => {
    it("upload.ts has no createdAt parameter in auth functions", () => {
      const uploadPath = new URL("../../src/lib/upload.ts", import.meta.url).pathname;
      const source = Deno.readTextFileSync(uploadPath);
      assertEquals(
        source.includes("createdAt"),
        false,
        "upload.ts must not contain a createdAt parameter",
      );
    });

    it("upload.ts auth template uses hardcoded current time", () => {
      const uploadPath = new URL("../../src/lib/upload.ts", import.meta.url).pathname;
      const source = Deno.readTextFileSync(uploadPath);
      assertEquals(
        source.includes("Math.floor(Date.now() / 1000)"),
        true,
        "upload.ts must use Math.floor(Date.now() / 1000) for inline current time",
      );
    });
  });
});
