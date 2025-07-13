import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { PrivateKeySigner } from "../src/lib/signer.ts";
import {
  createSoftwareApplicationEvent,
  createFileMetadataEvent,
  createReleaseArtifactSetEvent,
  fetchSoftwareApplicationEvent,
} from "../src/lib/nostr.ts";
import { detectPlatformsFromFileName } from "../src/lib/archive.ts";

Deno.test("NIP-82 - Create software application event", async () => {
  const signer = new PrivateKeySigner("0000000000000000000000000000000000000000000000000000000000000001");
  
  const appEvent = await createSoftwareApplicationEvent(
    signer,
    "com.example.testapp",
    {
      name: "Test Application",
      summary: "A test application",
      content: "This is a longer description of the test application with **markdown** support.",
      icon: "https://example.com/icon.png",
      image: ["https://example.com/screenshot1.png", "https://example.com/screenshot2.png"],
      tags: ["test", "nostr", "app"],
      url: "https://testapp.example.com",
      repository: "https://github.com/example/testapp",
      platforms: ["web", "linux", "windows"],
      license: "MIT",
    }
  );

  assertEquals(appEvent.kind, 32267);
  assertExists(appEvent.id);
  assertExists(appEvent.sig);
  
  // Check required tags
  const dTag = appEvent.tags.find(t => t[0] === "d");
  assertEquals(dTag?.[1], "com.example.testapp");
  
  const nameTag = appEvent.tags.find(t => t[0] === "name");
  assertEquals(nameTag?.[1], "Test Application");
  
  // Check platform tags
  const platformTags = appEvent.tags.filter(t => t[0] === "f");
  assertEquals(platformTags.length, 3);
  assertEquals(platformTags.map(t => t[1]).sort(), ["linux", "web", "windows"]);
  
  // Check optional tags
  const summaryTag = appEvent.tags.find(t => t[0] === "summary");
  assertEquals(summaryTag?.[1], "A test application");
  
  const iconTag = appEvent.tags.find(t => t[0] === "icon");
  assertEquals(iconTag?.[1], "https://example.com/icon.png");
  
  const repoTag = appEvent.tags.find(t => t[0] === "repository");
  assertEquals(repoTag?.[1], "https://github.com/example/testapp");
  
  const licenseTag = appEvent.tags.find(t => t[0] === "license");
  assertEquals(licenseTag?.[1], "MIT");
  
  // Check content
  assertEquals(appEvent.content, "This is a longer description of the test application with **markdown** support.");
});

Deno.test("NIP-82 - File metadata with platform tags", async () => {
  const signer = new PrivateKeySigner("0000000000000000000000000000000000000000000000000000000000000001");
  
  const fileEvent = await createFileMetadataEvent(
    signer,
    {
      url: "https://cdn.example.com/abc123",
      mimeType: "application/gzip",
      sha256: "abc123def456",
      size: 1234567,
      platforms: ["linux", "arm64"],
    },
    "Release v1.0.0 - app-linux-arm64.tar.gz"
  );

  assertEquals(fileEvent.kind, 1063);
  
  // Check platform tags
  const platformTags = fileEvent.tags.filter(t => t[0] === "f");
  assertEquals(platformTags.length, 2);
  assertEquals(platformTags.map(t => t[1]).sort(), ["arm64", "linux"]);
});

Deno.test("NIP-82 - Release event with application reference", async () => {
  const signer = new PrivateKeySigner("0000000000000000000000000000000000000000000000000000000000000001");
  const pubkey = await signer.getPublicKey();
  
  const releaseEvent = await createReleaseArtifactSetEvent(
    signer,
    "testapp",
    "v1.0.0",
    ["event-id-1", "event-id-2"],
    "Test release notes",
    "com.example.testapp"
  );

  assertEquals(releaseEvent.kind, 30063);
  
  // Check application reference
  const appRef = releaseEvent.tags.find(t => t[0] === "a");
  assertEquals(appRef?.[1], `32267:${pubkey}:com.example.testapp`);
  
  // Check other tags
  const dTag = releaseEvent.tags.find(t => t[0] === "d");
  assertEquals(dTag?.[1], "testapp@v1.0.0");
  
  const versionTag = releaseEvent.tags.find(t => t[0] === "version");
  assertEquals(versionTag?.[1], "v1.0.0");
  
  // Check event references
  const eventRefs = releaseEvent.tags.filter(t => t[0] === "e");
  assertEquals(eventRefs.length, 2);
  assertEquals(eventRefs.map(t => t[1]), ["event-id-1", "event-id-2"]);
});

Deno.test("Platform detection from file names", () => {
  const testCases = [
    { filename: "app-linux-x86_64.tar.gz", expected: ["linux"] },
    { filename: "app-windows.zip", expected: ["windows"] },
    { filename: "app-macos.dmg", expected: ["macos"] },
    { filename: "app-darwin-arm64.tar.gz", expected: ["macos"] },
    { filename: "MyApp.exe", expected: ["windows"] },
    { filename: "app.apk", expected: ["android"] },
    { filename: "app.ipa", expected: ["ios"] },
    { filename: "app-linux-arm64.tar.gz", expected: ["linux"] },
    { filename: "app-ubuntu-22.04.tar.gz", expected: ["linux"] },
    { filename: "app-debian.deb", expected: ["linux"] },
    { filename: "app.tar.gz", expected: ["web"] }, // Default when no platform detected
    { filename: "release-v1.0.0.zip", expected: ["web"] },
  ];

  for (const { filename, expected } of testCases) {
    const detected = detectPlatformsFromFileName(filename);
    assertEquals(detected.sort(), expected.sort(), `Platform detection for ${filename}`);
  }
});

Deno.test("NIP-82 - Minimal application event", async () => {
  const signer = new PrivateKeySigner("0000000000000000000000000000000000000000000000000000000000000001");
  
  const appEvent = await createSoftwareApplicationEvent(
    signer,
    "com.example.minimal",
    {
      name: "Minimal App",
      platforms: ["web"],
    }
  );

  assertEquals(appEvent.kind, 32267);
  
  // Check only required tags are present
  const dTag = appEvent.tags.find(t => t[0] === "d");
  assertEquals(dTag?.[1], "com.example.minimal");
  
  const nameTag = appEvent.tags.find(t => t[0] === "name");
  assertEquals(nameTag?.[1], "Minimal App");
  
  const platformTags = appEvent.tags.filter(t => t[0] === "f");
  assertEquals(platformTags.length, 1);
  assertEquals(platformTags[0][1], "web");
  
  // Check that optional tags are not present
  const summaryTag = appEvent.tags.find(t => t[0] === "summary");
  assertEquals(summaryTag, undefined);
  
  const iconTag = appEvent.tags.find(t => t[0] === "icon");
  assertEquals(iconTag, undefined);
});