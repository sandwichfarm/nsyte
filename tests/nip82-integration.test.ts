import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { SimpleSigner } from "applesauce-signers";
import {
  createFileMetadataEvent,
  createReleaseArtifactSetEvent,
  createSoftwareApplicationEvent,
} from "../src/lib/nostr.ts";
import { detectPlatformsFromFileName } from "../src/lib/archive.ts";

Deno.test("NIP-82 Integration - Full release workflow with application metadata", async () => {
  const signer = SimpleSigner.fromKey(
    "0000000000000000000000000000000000000000000000000000000000000001",
  );
  const pubkey = await signer.getPublicKey();

  // Step 1: Create software application event
  const appId = "com.example.myapp";
  const appEvent = await createSoftwareApplicationEvent(
    signer,
    appId,
    {
      name: "My Awesome App",
      summary: "Cross-platform decentralized application",
      content: "A comprehensive application that runs on multiple platforms.",
      repository: "https://github.com/example/myapp",
      platforms: ["web", "linux", "windows", "macos"],
      license: "Apache-2.0",
    },
  );

  assertEquals(appEvent.kind, 32267);
  assertExists(appEvent.id);

  // Step 2: Create platform-specific release artifacts
  const artifacts = [
    {
      filename: "myapp-linux-x86_64.tar.gz",
      url: "https://cdn.example.com/hash1",
      hash: "abc123",
      size: 10485760, // 10MB
    },
    {
      filename: "myapp-windows-x64.zip",
      url: "https://cdn.example.com/hash2",
      hash: "def456",
      size: 12582912, // 12MB
    },
    {
      filename: "myapp-macos-universal.dmg",
      url: "https://cdn.example.com/hash3",
      hash: "ghi789",
      size: 15728640, // 15MB
    },
  ];

  const fileEventIds: string[] = [];

  for (const artifact of artifacts) {
    // Detect platforms from filename
    const platforms = detectPlatformsFromFileName(artifact.filename);

    const fileEvent = await createFileMetadataEvent(
      signer,
      {
        url: artifact.url,
        mimeType: artifact.filename.endsWith(".dmg")
          ? "application/x-apple-diskimage"
          : artifact.filename.endsWith(".zip")
          ? "application/zip"
          : "application/gzip",
        sha256: artifact.hash,
        size: artifact.size,
        platforms,
      },
      `Release v1.0.0 - ${artifact.filename}`,
    );

    assertEquals(fileEvent.kind, 1063);
    assertExists(fileEvent.id);

    // Verify platform tags
    const platformTags = fileEvent.tags.filter((t) => t[0] === "f");
    if (artifact.filename.includes("linux")) {
      assertEquals(platformTags.some((t) => t[1] === "linux"), true);
    } else if (artifact.filename.includes("windows")) {
      assertEquals(platformTags.some((t) => t[1] === "windows"), true);
    } else if (artifact.filename.includes("macos")) {
      assertEquals(platformTags.some((t) => t[1] === "macos"), true);
    }

    fileEventIds.push(fileEvent.id);
  }

  // Step 3: Create release event linking to application
  const releaseEvent = await createReleaseArtifactSetEvent(
    signer,
    "myapp",
    "v1.0.0",
    fileEventIds,
    "First stable release with multi-platform support",
    appId,
  );

  assertEquals(releaseEvent.kind, 30063);

  // Verify application reference
  const appRef = releaseEvent.tags.find((t) => t[0] === "a");
  assertEquals(appRef?.[1], `32267:${pubkey}:${appId}`);

  // Verify all file events are referenced
  const eventRefs = releaseEvent.tags.filter((t) => t[0] === "e");
  assertEquals(eventRefs.length, 3);
  assertEquals(eventRefs.map((t) => t[1]).sort(), fileEventIds.sort());

  // Verify d-tag format
  const dTag = releaseEvent.tags.find((t) => t[0] === "d");
  assertEquals(dTag?.[1], "myapp@v1.0.0");
});

Deno.test("NIP-82 Integration - Incremental release building", async () => {
  const signer = SimpleSigner.fromKey(
    "0000000000000000000000000000000000000000000000000000000000000001",
  );

  // Simulate multiple CI runs adding artifacts to the same release
  const version = "v2.0.0";
  const allEventIds: string[] = [];

  // CI Run 1: Linux build
  const linuxEvent = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/linux-hash",
      mimeType: "application/gzip",
      sha256: "linux123",
      size: 10000000,
      platforms: ["linux"],
    },
    `Release ${version} - app-linux.tar.gz`,
  );
  allEventIds.push(linuxEvent.id);

  // CI Run 2: Windows build (would append to existing release)
  const windowsEvent = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/windows-hash",
      mimeType: "application/zip",
      sha256: "windows456",
      size: 12000000,
      platforms: ["windows"],
    },
    `Release ${version} - app-windows.zip`,
  );
  allEventIds.push(windowsEvent.id);

  // CI Run 3: macOS build (would append to existing release)
  const macosEvent = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/macos-hash",
      mimeType: "application/x-apple-diskimage",
      sha256: "macos789",
      size: 15000000,
      platforms: ["macos"],
    },
    `Release ${version} - app-macos.dmg`,
  );
  allEventIds.push(macosEvent.id);

  // Final release would contain all three artifacts
  const finalRelease = await createReleaseArtifactSetEvent(
    signer,
    "myapp",
    version,
    allEventIds,
    "Version 2.0.0 with all platform builds",
    "com.example.myapp",
  );

  const eventRefs = finalRelease.tags.filter((t) => t[0] === "e");
  assertEquals(eventRefs.length, 3);
  assertEquals(eventRefs.map((t) => t[1]).sort(), allEventIds.sort());
});

Deno.test("NIP-82 Integration - Platform detection edge cases", () => {
  const testCases = [
    {
      filename: "app-v1.0.0-linux-amd64.deb",
      expectedPlatforms: ["linux"],
      description: "Debian package",
    },
    {
      filename: "MyApp-Setup-Win64.exe",
      expectedPlatforms: ["windows"],
      description: "Windows installer",
    },
    {
      filename: "app-1.0.0-osx.pkg",
      expectedPlatforms: ["macos"],
      description: "macOS package",
    },
    {
      filename: "app-arm64-darwin.tar.gz",
      expectedPlatforms: ["macos"],
      description: "macOS ARM64 build",
    },
    {
      filename: "app-x86_64-pc-windows-msvc.zip",
      expectedPlatforms: ["windows"],
      description: "Rust-style Windows build",
    },
    {
      filename: "app.aab",
      expectedPlatforms: ["android"],
      description: "Android App Bundle",
    },
    {
      filename: "app-universal.tar.gz",
      expectedPlatforms: ["web"],
      description: "Universal/web build (no specific platform)",
    },
  ];

  for (const { filename, expectedPlatforms, description } of testCases) {
    const detected = detectPlatformsFromFileName(filename);
    assertEquals(
      detected.sort(),
      expectedPlatforms.sort(),
      `${description}: ${filename}`,
    );
  }
});
