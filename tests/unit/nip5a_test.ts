import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  decodePubkeyBase36,
  DTAG_MAX_LENGTH,
  encodePubkeyBase36,
  PUBKEY_B36_LENGTH,
  PUBKEY_BYTE_LENGTH,
  suggestIdentifier,
  validateDTag,
} from "../../src/lib/nip5a.ts";

describe("encodePubkeyBase36", () => {
  it("encodes all-zero pubkey to 50 zero chars", () => {
    const pubkey = new Uint8Array(32);
    const result = encodePubkeyBase36(pubkey);
    assertEquals(result, "00000000000000000000000000000000000000000000000000");
    assertEquals(result.length, 50);
  });

  it("encodes all-0xFF pubkey to exactly 50 chars", () => {
    const pubkey = new Uint8Array(32).fill(0xFF);
    const result = encodePubkeyBase36(pubkey);
    assertEquals(result, "6dp5qcb22im238nr3wvp0ic7q99w035jmy2iw7i6n43d37jtof");
    assertEquals(result.length, 50);
  });

  it("encodes known pubkey from NIP spec", () => {
    // hex: 266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5
    const hex = "266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5";
    const pubkey = new Uint8Array(
      hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    const result = encodePubkeyBase36(pubkey);
    assertEquals(result.length, 50);
    assertEquals(/^[0-9a-z]{50}$/.test(result), true);
  });

  it("always returns exactly 50 characters", () => {
    const testPubkeys = [
      new Uint8Array(32).fill(0x01),
      new Uint8Array(32).fill(0x80),
      new Uint8Array(32).fill(0xAB),
    ];
    for (const pubkey of testPubkeys) {
      const result = encodePubkeyBase36(pubkey);
      assertEquals(result.length, 50);
    }
  });

  it("throws on wrong input length", () => {
    assertThrows(
      () => encodePubkeyBase36(new Uint8Array(31)),
      Error,
      "Expected 32-byte pubkey",
    );
    assertThrows(
      () => encodePubkeyBase36(new Uint8Array(33)),
      Error,
      "Expected 32-byte pubkey",
    );
  });

  it("output contains only lowercase alphanumeric", () => {
    const pubkey = new Uint8Array(32).fill(0x42);
    const result = encodePubkeyBase36(pubkey);
    assertEquals(/^[0-9a-z]{50}$/.test(result), true);
  });
});

describe("decodePubkeyBase36", () => {
  it("decodes all-zero string back to 32 zero bytes", () => {
    const input = "0".repeat(50);
    const result = decodePubkeyBase36(input);
    assertEquals(result, new Uint8Array(32));
  });

  it("roundtrips with encodePubkeyBase36", () => {
    const hex = "266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5";
    const pubkey = new Uint8Array(
      hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    const encoded = encodePubkeyBase36(pubkey);
    const decoded = decodePubkeyBase36(encoded);
    assertEquals(decoded, pubkey);
  });

  it("throws on wrong length", () => {
    assertThrows(
      () => decodePubkeyBase36("0".repeat(49)),
      Error,
      "Expected 50-character",
    );
    assertThrows(
      () => decodePubkeyBase36("0".repeat(51)),
      Error,
      "Expected 50-character",
    );
  });

  it("throws on invalid characters", () => {
    assertThrows(
      () => decodePubkeyBase36("A" + "0".repeat(49)),
      Error,
      "Invalid base36 character",
    );
  });

  it("throws on uppercase characters", () => {
    assertThrows(
      () => decodePubkeyBase36("Z" + "0".repeat(49)),
      Error,
      "Invalid base36 character",
    );
  });

  it("throws on overflow (value > 2^256 - 1)", () => {
    const overflowInput = "z".repeat(50);
    assertThrows(
      () => decodePubkeyBase36(overflowInput),
      Error,
      "does not fit into 32-byte pubkey",
    );
  });
});

describe("roundtrip", () => {
  it("encode then decode returns original bytes", () => {
    const testPubkeys = [
      new Uint8Array(32).fill(0x01),
      new Uint8Array(32).fill(0xFF),
      new Uint8Array(32).fill(0x80),
    ];
    for (const pubkey of testPubkeys) {
      const encoded = encodePubkeyBase36(pubkey);
      const decoded = decodePubkeyBase36(encoded);
      assertEquals(decoded, pubkey);
    }
  });

  it("decode then encode returns original string", () => {
    const encoded = "6dp5qcb22im238nr3wvp0ic7q99w035jmy2iw7i6n43d37jtof";
    const decoded = decodePubkeyBase36(encoded);
    const reencoded = encodePubkeyBase36(decoded);
    assertEquals(reencoded, encoded);
  });
});

describe("validateDTag", () => {
  it("accepts valid identifiers", () => {
    const validTags = ["blog", "my-site", "a", "1", "123", "a-b-c"];
    for (const tag of validTags) {
      const result = validateDTag(tag);
      assertEquals(result.valid, true, `Expected "${tag}" to be valid`);
    }
  });

  it("accepts max-length identifier", () => {
    const tag = "1234567890123"; // 13 chars
    const result = validateDTag(tag);
    assertEquals(result.valid, true);
  });

  it("rejects empty string", () => {
    const result = validateDTag("");
    assertEquals(result.valid, false);
    assertEquals(result.error?.includes("empty"), true);
  });

  it("rejects identifier exceeding 13 chars", () => {
    const tag = "12345678901234"; // 14 chars
    const result = validateDTag(tag);
    assertEquals(result.valid, false);
    assertEquals(result.error?.includes("too long"), true);
  });

  it("rejects trailing hyphen", () => {
    const result = validateDTag("blog-");
    assertEquals(result.valid, false);
    assertEquals(result.error?.includes("hyphen"), true);
    assertEquals(result.suggestion, "blog");
  });

  it("rejects uppercase letters", () => {
    const result = validateDTag("Blog");
    assertEquals(result.valid, false);
    assertEquals(result.suggestion, "blog");
  });

  it("rejects underscores", () => {
    const result = validateDTag("my_site");
    assertEquals(result.valid, false);
    assertEquals(result.suggestion, "my-site");
  });

  it("rejects spaces", () => {
    const result = validateDTag("my site");
    assertEquals(result.valid, false);
  });

  it("rejects dots", () => {
    const result = validateDTag("my.site");
    assertEquals(result.valid, false);
  });

  it("rejects special characters", () => {
    const result = validateDTag("my@site!");
    assertEquals(result.valid, false);
  });
});

describe("suggestIdentifier", () => {
  it("lowercases input", () => {
    assertEquals(suggestIdentifier("HELLO"), "hello");
  });

  it("replaces underscores with hyphens", () => {
    assertEquals(suggestIdentifier("my_blog"), "my-blog");
  });

  it("strips invalid characters", () => {
    assertEquals(suggestIdentifier("my.blog!"), "myblog");
  });

  it("truncates to 13 chars", () => {
    const result = suggestIdentifier("this-is-way-too-long");
    assertEquals(result.length <= 13, true);
  });

  it("removes trailing hyphens after truncation", () => {
    // "abcdefghijklm-nop" → truncated to 13 = "abcdefghijklm" (no trailing hyphen in this case)
    // Use a string where truncation creates a trailing hyphen
    const result = suggestIdentifier("abcdefghijkl-nop");
    assertEquals(result.endsWith("-"), false);
  });

  it("returns 'site' for empty result", () => {
    assertEquals(suggestIdentifier("!!!"), "site");
  });

  it("handles mixed transforms", () => {
    // "My_Cool_Blog_123" → lowercase: "my_cool_blog_123"
    // → replace underscores: "my-cool-blog-123"
    // → strip invalid: "my-cool-blog-123"
    // → truncate to 13: "my-cool-blog-"
    // → remove trailing hyphens: "my-cool-blog"
    assertEquals(suggestIdentifier("My_Cool_Blog_123"), "my-cool-blog");
  });
});

describe("constants", () => {
  it("PUBKEY_B36_LENGTH is 50", () => {
    assertEquals(PUBKEY_B36_LENGTH, 50);
  });

  it("PUBKEY_BYTE_LENGTH is 32", () => {
    assertEquals(PUBKEY_BYTE_LENGTH, 32);
  });

  it("DTAG_MAX_LENGTH is 13", () => {
    assertEquals(DTAG_MAX_LENGTH, 13);
  });
});
