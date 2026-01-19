import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.0";
import {
  clearNip05Cache,
  isNip05Identifier,
  normalizePubkeyInput,
  resolveNip05ToPubkey,
} from "../../src/lib/nip05.ts";

Deno.test("NIP-05 Identifier Validation", async (t) => {
  await t.step("should identify valid NIP-05 identifiers", () => {
    assertEquals(isNip05Identifier("user@example.com"), true);
    assertEquals(isNip05Identifier("_@example.com"), true);
    assertEquals(isNip05Identifier("user.name@sub.example.com"), true);
    assertEquals(isNip05Identifier("user-name@example.co.uk"), true);
  });

  await t.step("should reject invalid NIP-05 identifiers", () => {
    assertEquals(isNip05Identifier("invalid"), false);
    assertEquals(isNip05Identifier("@example.com"), false);
    assertEquals(isNip05Identifier("user@"), false);
    assertEquals(isNip05Identifier("user@com"), false);
    assertEquals(isNip05Identifier("npub1..."), false);
  });
});

Deno.test("NIP-05 Resolution", async (t) => {
  await t.step("should resolve valid NIP-05 identifier", async () => {
    clearNip05Cache();
    const pubkey = await resolveNip05ToPubkey("_@hzrd149.com");
    assertEquals(typeof pubkey, "string");
    assertEquals(pubkey?.length, 64);
    assertEquals(/^[0-9a-f]{64}$/i.test(pubkey || ""), true);
  });

  await t.step("should return null for non-existent NIP-05", async () => {
    clearNip05Cache();
    const pubkey = await resolveNip05ToPubkey("nonexistent@example.com", { timeout: 3000 });
    assertEquals(pubkey, null);
  });

  await t.step("should use cache on subsequent requests", async () => {
    clearNip05Cache();
    const pubkey1 = await resolveNip05ToPubkey("_@hzrd149.com");
    const pubkey2 = await resolveNip05ToPubkey("_@hzrd149.com");
    assertEquals(pubkey1, pubkey2);
  });

  await t.step("should timeout on slow responses", async () => {
    clearNip05Cache();
    // Using a domain that will likely timeout or not respond
    const pubkey = await resolveNip05ToPubkey("test@192.0.2.1", { timeout: 1000 });
    assertEquals(pubkey, null);
  });
});

Deno.test("Pubkey Input Normalization", async (t) => {
  await t.step("should normalize hex pubkey", async () => {
    const hex = "266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5";
    const normalized = await normalizePubkeyInput(hex);
    assertEquals(normalized, hex);
  });

  await t.step("should normalize npub", async () => {
    // Generated from the hex pubkey using npubEncode
    const hex = "266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5";
    const npub = "npub1ye5ptcxfyyxl5vjvdjar2ua3f0hynkjzpx552mu5snj3qmx5pzjscpknpr";
    const normalized = await normalizePubkeyInput(npub);
    assertEquals(normalized, hex);
  });

  await t.step("should resolve NIP-05 identifier", async () => {
    clearNip05Cache();
    const normalized = await normalizePubkeyInput("_@hzrd149.com");
    assertEquals(typeof normalized, "string");
    assertEquals(normalized.length, 64);
    assertEquals(/^[0-9a-f]{64}$/i.test(normalized), true);
  });

  await t.step("should throw error for invalid input", async () => {
    await assertRejects(
      async () => await normalizePubkeyInput("invalid_input"),
      Error,
      "Invalid pubkey format",
    );
  });

  await t.step("should throw error for failed NIP-05 resolution", async () => {
    clearNip05Cache();
    await assertRejects(
      async () => await normalizePubkeyInput("nonexistent@example.com"),
      Error,
      "Failed to resolve NIP-05 identifier",
    );
  });

  await t.step("should handle empty input", async () => {
    await assertRejects(
      async () => await normalizePubkeyInput(""),
      Error,
      "Invalid pubkey input: empty or not a string",
    );
  });

  await t.step("should trim whitespace", async () => {
    const hex = "266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5";
    const normalized = await normalizePubkeyInput(`  ${hex}  `);
    assertEquals(normalized, hex);
  });
});
