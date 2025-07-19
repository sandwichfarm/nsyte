import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { createFileMetadataEvent, createReleaseArtifactSetEvent } from "../src/lib/nostr.ts";
import { calculateSha256 } from "../src/lib/archive.ts";
import { SimpleSigner } from "applesauce-signers/signers";

Deno.test("NIP-94 file metadata event creation", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const testData = new TextEncoder().encode("test file content");
  const sha256 = await calculateSha256(testData);

  const event = await createFileMetadataEvent(
    signer,
    {
      url: "https://example.com/file.tar.gz",
      mimeType: "application/gzip",
      sha256: sha256,
      size: testData.length,
    },
    "Test release v1.0.0",
  );

  assertEquals(event.kind, 1063);
  assertEquals(event.content, "Test release v1.0.0");

  // Check tags
  const urlTag = event.tags.find((t) => t[0] === "url");
  assertExists(urlTag);
  assertEquals(urlTag[1], "https://example.com/file.tar.gz");

  const mimeTag = event.tags.find((t) => t[0] === "m");
  assertExists(mimeTag);
  assertEquals(mimeTag[1], "application/gzip");

  const hashTag = event.tags.find((t) => t[0] === "x");
  assertExists(hashTag);
  assertEquals(hashTag[1], sha256);

  const sizeTag = event.tags.find((t) => t[0] === "size");
  assertExists(sizeTag);
  assertEquals(sizeTag[1], testData.length.toString());
});

Deno.test("NIP-51 release artifact set event creation - single file", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const event = await createReleaseArtifactSetEvent(
    signer,
    "my-project",
    "v1.0.0",
    "file-metadata-event-id",
    "Release notes for v1.0.0",
  );

  assertEquals(event.kind, 30063);
  assertEquals(event.content, "Release notes for v1.0.0");

  // Check tags
  const dTag = event.tags.find((t) => t[0] === "d");
  assertExists(dTag);
  assertEquals(dTag[1], "my-project@v1.0.0");

  const eTag = event.tags.find((t) => t[0] === "e");
  assertExists(eTag);
  assertEquals(eTag[1], "file-metadata-event-id");

  const versionTag = event.tags.find((t) => t[0] === "version");
  assertExists(versionTag);
  assertEquals(versionTag[1], "v1.0.0");
});

Deno.test("NIP-51 release artifact set event creation - multiple files", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const event = await createReleaseArtifactSetEvent(
    signer,
    "my-project",
    "v2.0.0",
    ["file-1-id", "file-2-id", "file-3-id"],
    "Release notes for v2.0.0 with multiple artifacts",
  );

  assertEquals(event.kind, 30063);
  assertEquals(event.content, "Release notes for v2.0.0 with multiple artifacts");

  // Check tags
  const dTag = event.tags.find((t) => t[0] === "d");
  assertExists(dTag);
  assertEquals(dTag[1], "my-project@v2.0.0");

  // Check all e tags
  const eTags = event.tags.filter((t) => t[0] === "e");
  assertEquals(eTags.length, 3);
  assertEquals(eTags[0][1], "file-1-id");
  assertEquals(eTags[1][1], "file-2-id");
  assertEquals(eTags[2][1], "file-3-id");

  const versionTag = event.tags.find((t) => t[0] === "version");
  assertExists(versionTag);
  assertEquals(versionTag[1], "v2.0.0");
});
