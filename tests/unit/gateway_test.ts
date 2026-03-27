import { assertEquals } from "@std/assert";
import { extractNpubAndIdentifier, find404Fallback } from "../../src/lib/gateway.ts";
import { encodePubkeyBase36 } from "../../src/lib/nip5a.ts";
import type { FileEntry } from "../../src/lib/nostr.ts";

// Generate a test pubkey (32 bytes = 64 hex chars)
const TEST_PUBKEY_HEX = "266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5";
const TEST_PUBKEY_BYTES = new Uint8Array(
  TEST_PUBKEY_HEX.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
);
const TEST_PUBKEY_B36 = encodePubkeyBase36(TEST_PUBKEY_BYTES); // 50 chars

Deno.test("extractNpubAndIdentifier - NIP-5A named site format", async (t) => {
  await t.step("parses valid base36 pubkey with dTag", () => {
    const result = extractNpubAndIdentifier(
      `${TEST_PUBKEY_B36}blog.localhost`,
    );
    assertEquals(result?.pubkey, TEST_PUBKEY_HEX);
    assertEquals(result?.identifier, "blog");
    assertEquals(result?.kind, 35128);
  });

  await t.step("parses valid base36 pubkey with multi-char dTag", () => {
    const result = extractNpubAndIdentifier(
      `${TEST_PUBKEY_B36}my-site-name.localhost`,
    );
    assertEquals(result?.pubkey, TEST_PUBKEY_HEX);
    assertEquals(result?.identifier, "my-site-name");
    assertEquals(result?.kind, 35128);
  });

  await t.step(
    "parses base36 pubkey without dTag as root site kind",
    () => {
      const result = extractNpubAndIdentifier(
        `${TEST_PUBKEY_B36}.localhost`,
      );
      assertEquals(result?.pubkey, TEST_PUBKEY_HEX);
      assertEquals(result?.identifier, "");
      assertEquals(result?.kind, 15128);
    },
  );

  await t.step("returns null for invalid base36 characters", () => {
    const invalidB36 = "!!" + TEST_PUBKEY_B36.slice(2);
    const result = extractNpubAndIdentifier(
      `${invalidB36}blog.localhost`,
    );
    assertEquals(result, null);
  });

  await t.step("returns null for dTag with trailing hyphen", () => {
    const result = extractNpubAndIdentifier(
      `${TEST_PUBKEY_B36}blog-.localhost`,
    );
    assertEquals(result, null);
  });

  await t.step("returns null for dTag exceeding 13 chars", () => {
    const result = extractNpubAndIdentifier(
      `${TEST_PUBKEY_B36}toolongidentif.localhost`,
    );
    assertEquals(result, null);
  });

  await t.step("returns null for dTag with uppercase letters", () => {
    const result = extractNpubAndIdentifier(
      `${TEST_PUBKEY_B36}Blog.localhost`,
    );
    assertEquals(result, null);
  });

  await t.step("returns null for dTag with underscores", () => {
    const result = extractNpubAndIdentifier(
      `${TEST_PUBKEY_B36}my_site.localhost`,
    );
    assertEquals(result, null);
  });
});

Deno.test(
  "extractNpubAndIdentifier - root site format (unchanged)",
  async (t) => {
    await t.step("parses valid npub hostname", () => {
      const result = extractNpubAndIdentifier(
        "npub1ye5ptcxfyyxl5vjvdjar2ua3f0hynkjzpx552mu5snj3qmx5pzjscpknpr.localhost",
      );
      assertEquals(result?.pubkey, TEST_PUBKEY_HEX);
      assertEquals(result?.kind, 15128);
      assertEquals(result?.identifier, "");
    });

    await t.step("returns null for invalid npub", () => {
      const result = extractNpubAndIdentifier("npub1invalid.localhost");
      assertEquals(result, null);
    });
  },
);

Deno.test(
  "extractNpubAndIdentifier - old format rejection",
  async (t) => {
    await t.step("rejects old identifier.npub format", () => {
      const result = extractNpubAndIdentifier(
        "blog.npub1ye5ptcxfyyxl5vjvdjar2ua3f0hynkjzpx552mu5snj3qmx5pzjscpknpr.localhost",
      );
      assertEquals(result, null);
    });
  },
);

// Helper to create mock FileEntry objects for 404 tests
const mockFile = (path: string, sha256 = "a".repeat(64)): FileEntry => ({
  path,
  sha256,
  size: 100,
  contentType: "text/html",
});

Deno.test("find404Fallback - NIP-5A compliance", async (t) => {
  await t.step("finds uncompressed 404.html", () => {
    const files = [
      mockFile("index.html"),
      mockFile("404.html"),
    ];
    const result = find404Fallback(files, false, false);
    assertEquals(result?.file.path, "404.html");
    assertEquals(result?.compressed, false);
    assertEquals(result?.type, null);
  });

  await t.step(
    "prefers brotli-compressed 404.html.br when supported",
    () => {
      const files = [
        mockFile("404.html"),
        mockFile("404.html.br"),
      ];
      const result = find404Fallback(files, true, false);
      assertEquals(result?.file.path, "404.html.br");
      assertEquals(result?.compressed, true);
      assertEquals(result?.type, "br");
    },
  );

  await t.step(
    "prefers gzip-compressed 404.html.gz when supported",
    () => {
      const files = [
        mockFile("404.html"),
        mockFile("404.html.gz"),
      ];
      const result = find404Fallback(files, false, true);
      assertEquals(result?.file.path, "404.html.gz");
      assertEquals(result?.compressed, true);
      assertEquals(result?.type, "gz");
    },
  );

  await t.step("prefers brotli over gzip when both supported", () => {
    const files = [
      mockFile("404.html"),
      mockFile("404.html.br"),
      mockFile("404.html.gz"),
    ];
    const result = find404Fallback(files, true, true);
    assertEquals(result?.file.path, "404.html.br");
  });

  await t.step("returns null when no 404.html exists", () => {
    const files = [
      mockFile("index.html"),
      mockFile("style.css"),
    ];
    const result = find404Fallback(files, true, true);
    assertEquals(result, null);
  });

  await t.step("skips 404.html with empty sha256", () => {
    const files: FileEntry[] = [
      { path: "404.html", sha256: "", size: 100, contentType: "text/html" },
    ];
    const result = find404Fallback(files, false, false);
    assertEquals(result, null);
  });

  await t.step("handles path with leading slash", () => {
    const files = [
      mockFile("/404.html"),
    ];
    const result = find404Fallback(files, false, false);
    assertEquals(result?.file.path, "/404.html");
    assertEquals(result?.compressed, false);
  });

  await t.step(
    "falls back to uncompressed when brotli not supported",
    () => {
      const files = [
        mockFile("404.html.br"),
        mockFile("404.html"),
      ];
      const result = find404Fallback(files, false, false);
      assertEquals(result?.file.path, "404.html");
      assertEquals(result?.compressed, false);
    },
  );

  await t.step(
    "falls back to gzip when brotli file missing",
    () => {
      const files = [
        mockFile("404.html.gz"),
        mockFile("404.html"),
      ];
      const result = find404Fallback(files, true, true);
      assertEquals(result?.file.path, "404.html.gz");
      assertEquals(result?.compressed, true);
      assertEquals(result?.type, "gz");
    },
  );
});
