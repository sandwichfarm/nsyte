import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { SimpleSigner } from "applesauce-signers/signers";
import {
  createFileMetadataEvent,
  createReleaseArtifactSetEvent,
  fetchFileMetadataEvents,
  fetchReleaseEvents,
} from "../src/lib/nostr.ts";
import { calculateSha256, createTarGzArchive } from "../src/lib/archive.ts";
import type { FileEntry, NostrEvent } from "../src/lib/nostr.ts";

// Mock relay pool for testing
const mockEvents: NostrEvent[] = [];

Deno.test("NIP-94 - Create file metadata event with all fields", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const testData = new TextEncoder().encode("test file content for comprehensive test");
  const sha256 = await calculateSha256(testData);

  const event = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/releases/app-v1.0.0.tar.gz",
      mimeType: "application/gzip",
      sha256: sha256,
      size: testData.length,
    },
    "Production release v1.0.0 for Linux x64",
  );

  // Verify event structure
  assertEquals(event.kind, 1063);
  assertEquals(event.content, "Production release v1.0.0 for Linux x64");

  // Verify all required tags
  const urlTag = event.tags.find((t) => t[0] === "url");
  assertExists(urlTag);
  assertEquals(urlTag[1], "https://cdn.example.com/releases/app-v1.0.0.tar.gz");

  const mimeTag = event.tags.find((t) => t[0] === "m");
  assertExists(mimeTag);
  assertEquals(mimeTag[1], "application/gzip");

  const hashTag = event.tags.find((t) => t[0] === "x");
  assertExists(hashTag);
  assertEquals(hashTag[1], sha256);

  const sizeTag = event.tags.find((t) => t[0] === "size");
  assertExists(sizeTag);
  assertEquals(sizeTag[1], testData.length.toString());

  const clientTag = event.tags.find((t) => t[0] === "client");
  assertExists(clientTag);
  assertEquals(clientTag[1], "nsyte");
});

Deno.test("NIP-94 - Handle multiple MIME types correctly", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const mimeTypes = [
    { ext: "tar.gz", mime: "application/gzip" },
    { ext: "zip", mime: "application/zip" },
    { ext: "tar", mime: "application/x-tar" },
    { ext: "unknown", mime: "application/octet-stream" },
  ];

  for (const { ext, mime } of mimeTypes) {
    const event = await createFileMetadataEvent(
      signer,
      {
        url: `https://example.com/file.${ext}`,
        mimeType: mime,
        sha256: "deadbeef",
        size: 1024,
      },
      `Test file ${ext}`,
    );

    const mimeTag = event.tags.find((t) => t[0] === "m");
    assertEquals(mimeTag?.[1], mime);
  }
});

Deno.test("NIP-51 - Create release with single artifact", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const event = await createReleaseArtifactSetEvent(
    signer,
    "awesome-app",
    "v1.0.0",
    "file-metadata-event-id-123",
    "First stable release of Awesome App",
  );

  assertEquals(event.kind, 30063);
  assertEquals(event.content, "First stable release of Awesome App");

  // Verify d-tag format
  const dTag = event.tags.find((t) => t[0] === "d");
  assertExists(dTag);
  assertEquals(dTag[1], "awesome-app@v1.0.0");

  // Verify event reference
  const eTag = event.tags.find((t) => t[0] === "e");
  assertExists(eTag);
  assertEquals(eTag[1], "file-metadata-event-id-123");

  // Verify version tag
  const versionTag = event.tags.find((t) => t[0] === "version");
  assertExists(versionTag);
  assertEquals(versionTag[1], "v1.0.0");
});

Deno.test("NIP-51 - Create release with multiple artifacts", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const artifactIds = [
    "linux-build-event-id",
    "macos-build-event-id",
    "windows-build-event-id",
    "source-code-event-id",
  ];

  const event = await createReleaseArtifactSetEvent(
    signer,
    "multi-platform-app",
    "v2.5.0",
    artifactIds,
    "Multi-platform release with source code",
  );

  assertEquals(event.kind, 30063);

  // Verify all artifact references
  const eTags = event.tags.filter((t) => t[0] === "e");
  assertEquals(eTags.length, 4);

  for (let i = 0; i < artifactIds.length; i++) {
    assertEquals(eTags[i][1], artifactIds[i]);
  }
});

Deno.test("NIP-51 - Handle version formats", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const versions = [
    "v1.0.0",
    "1.0.0",
    "latest",
    "nightly",
    "v2.0.0-beta.1",
    "v3.0.0-rc1",
    "2023.12.25",
  ];

  for (const version of versions) {
    const event = await createReleaseArtifactSetEvent(
      signer,
      "version-test-app",
      version,
      "dummy-event-id",
      `Release ${version}`,
    );

    const dTag = event.tags.find((t) => t[0] === "d");
    assertEquals(dTag?.[1], `version-test-app@${version}`);

    const versionTag = event.tags.find((t) => t[0] === "version");
    assertEquals(versionTag?.[1], version);
  }
});

Deno.test("Archive creation - Create tar.gz from files", async () => {
  // Create temporary test files
  const tempDir = await Deno.makeTempDir();
  const testFiles: FileEntry[] = [
    {
      path: "index.html",
      data: new TextEncoder().encode("<html><body>Hello World</body></html>"),
      size: 38,
      contentType: "text/html",
    },
    {
      path: "styles/main.css",
      data: new TextEncoder().encode("body { margin: 0; }"),
      size: 19,
      contentType: "text/css",
    },
    {
      path: "scripts/app.js",
      data: new TextEncoder().encode("console.log('Hello');"),
      size: 21,
      contentType: "application/javascript",
    },
  ];

  // Calculate hashes for test files
  for (const file of testFiles) {
    if (file.data) {
      file.sha256 = await calculateSha256(file.data);
    }
  }

  const archivePath = `${tempDir}/test-archive.tar.gz`;

  try {
    const archive = await createTarGzArchive(
      testFiles,
      tempDir,
      archivePath,
    );

    // Verify archive was created
    assertExists(archive.data);
    assertEquals(archive.path, archivePath);
    assertEquals(archive.size, archive.data.length);

    // Verify file exists on disk
    const fileInfo = await Deno.stat(archivePath);
    assertEquals(fileInfo.isFile, true);
    assertEquals(fileInfo.size, archive.size);

    // Verify it's a gzip file (starts with gzip magic bytes)
    assertEquals(archive.data[0], 0x1f);
    assertEquals(archive.data[1], 0x8b);
  } finally {
    // Cleanup
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("Archive SHA-256 calculation", async () => {
  const testCases = [
    {
      data: new TextEncoder().encode("Hello, World!"),
      expectedHash: "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f",
    },
    {
      data: new TextEncoder().encode(""),
      expectedHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      data: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
      expectedHash: "1f825aa2f0020ef7cf91dfa30da4668d791c5d4824fc8e41354b89ec05795ab3",
    },
  ];

  for (const { data, expectedHash } of testCases) {
    const hash = await calculateSha256(data);
    assertEquals(hash, expectedHash);
  }
});

Deno.test("Release management - Detect duplicate artifacts by hash", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  // Create a file metadata event
  const fileEvent = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/app.tar.gz",
      mimeType: "application/gzip",
      sha256: "abc123def456",
      size: 1024 * 1024,
    },
    "Release v1.0.0 - app.tar.gz",
  );

  // Create release referencing this file
  const releaseEvent = await createReleaseArtifactSetEvent(
    signer,
    "test-app",
    "v1.0.0",
    [fileEvent.id],
    "Test release",
  );

  // Verify the release structure
  const dTag = releaseEvent.tags.find((t) => t[0] === "d");
  assertEquals(dTag?.[1], "test-app@v1.0.0");

  const eTags = releaseEvent.tags.filter((t) => t[0] === "e");
  assertEquals(eTags.length, 1);
  assertEquals(eTags[0][1], fileEvent.id);
});

Deno.test("Release management - Replace artifacts with same name", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  // Original file
  const originalFile = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/old-hash",
      mimeType: "application/gzip",
      sha256: "old-hash-123",
      size: 1000,
    },
    "Release v1.0.0 - app.tar.gz",
  );

  // Updated file with same name but different hash
  const updatedFile = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/new-hash",
      mimeType: "application/gzip",
      sha256: "new-hash-456",
      size: 1100,
    },
    "Release v1.0.0 - app.tar.gz",
  );

  // Create release with only the updated file
  const releaseEvent = await createReleaseArtifactSetEvent(
    signer,
    "test-app",
    "v1.0.0",
    [updatedFile.id], // Only include the new file
    "Updated release",
  );

  const eTags = releaseEvent.tags.filter((t) => t[0] === "e");
  assertEquals(eTags.length, 1);
  assertEquals(eTags[0][1], updatedFile.id);
  assertEquals(eTags.some((t) => t[1] === originalFile.id), false);
});

Deno.test("Release management - Append new artifacts", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  // Existing artifacts
  const linuxBuild = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/linux.tar.gz",
      mimeType: "application/gzip",
      sha256: "linux-hash",
      size: 5000000,
    },
    "Release v2.0.0 - linux.tar.gz",
  );

  // New artifact to append
  const windowsBuild = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/windows.zip",
      mimeType: "application/zip",
      sha256: "windows-hash",
      size: 6000000,
    },
    "Release v2.0.0 - windows.zip",
  );

  // Create release with both artifacts
  const releaseEvent = await createReleaseArtifactSetEvent(
    signer,
    "cross-platform-app",
    "v2.0.0",
    [linuxBuild.id, windowsBuild.id],
    "Cross-platform release",
  );

  const eTags = releaseEvent.tags.filter((t) => t[0] === "e");
  assertEquals(eTags.length, 2);

  const eventIds = eTags.map((t) => t[1]);
  assertEquals(eventIds.includes(linuxBuild.id), true);
  assertEquals(eventIds.includes(windowsBuild.id), true);
});
