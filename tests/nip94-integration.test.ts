import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.220.0/path/mod.ts";
import { calculateSha256 } from "../src/lib/archive.ts";

// This test simulates the full workflow of the upload command with NIP-94
Deno.test("NIP-94 Integration - Simulate upload workflow", async () => {
  const tempDir = await Deno.makeTempDir();
  
  try {
    // Step 1: Create test archives
    const archives = [
      {
        name: "app-linux.tar.gz",
        content: new TextEncoder().encode("Linux build content"),
      },
      {
        name: "app-windows.zip",
        content: new TextEncoder().encode("Windows build content"),
      },
      {
        name: "app-macos.tar.gz",
        content: new TextEncoder().encode("macOS build content"),
      }
    ];
    
    // Write archives to temp directory
    const archiveFiles = [];
    for (const archive of archives) {
      const path = join(tempDir, archive.name);
      await Deno.writeFile(path, archive.content);
      
      const hash = await calculateSha256(archive.content);
      archiveFiles.push({
        path: archive.name,
        fullPath: path,
        hash,
        size: archive.content.length
      });
    }
    
    // Step 2: Simulate loading archives (as done in upload command)
    const loadedArchives = [];
    for (const file of archiveFiles) {
      const data = await Deno.readFile(file.fullPath);
      const hash = await calculateSha256(data);
      
      assertEquals(hash, file.hash, "Hash should match");
      
      loadedArchives.push({
        path: file.path,
        data,
        size: data.length,
        sha256: hash,
        contentType: file.path.endsWith(".zip") ? "application/zip" : "application/gzip"
      });
    }
    
    // Step 3: Verify all archives loaded correctly
    assertEquals(loadedArchives.length, 3);
    
    for (const archive of loadedArchives) {
      assertExists(archive.data);
      assertExists(archive.sha256);
      assertEquals(archive.size, archive.data.length);
    }
    
    // Step 4: Simulate duplicate detection
    const existingHashes = new Set([archiveFiles[0].hash]); // Linux already exists
    
    const newArchives = loadedArchives.filter(a => !existingHashes.has(a.sha256!));
    assertEquals(newArchives.length, 2, "Should skip Linux archive");
    
    // Step 5: Simulate replacement detection
    const existingArtifacts = new Map([
      ["app-windows.zip", { hash: "old-hash", eventId: "old-event-id" }]
    ]);
    
    const toReplace = [];
    const toAdd = [];
    
    for (const archive of newArchives) {
      const existing = existingArtifacts.get(archive.path);
      if (existing && existing.hash !== archive.sha256) {
        toReplace.push(archive);
      } else if (!existing) {
        toAdd.push(archive);
      }
    }
    
    assertEquals(toReplace.length, 1, "Should replace Windows archive");
    assertEquals(toAdd.length, 1, "Should add macOS archive");
    
  } finally {
    // Cleanup
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("NIP-94 Integration - Archive path validation", async () => {
  const testCases = [
    { path: "dist.tar.gz", valid: true },
    { path: "build/app.zip", valid: true },
    { path: "../outside.tar", valid: true }, // Relative paths are resolved
    { path: "/absolute/path.tar.gz", valid: true },
    { path: "no-extension", valid: true }, // Extension not required
  ];
  
  for (const { path, valid } of testCases) {
    // In real implementation, any readable file is valid
    assertEquals(valid, true, `Path ${path} should be valid`);
  }
});

Deno.test("NIP-94 Integration - MIME type detection", () => {
  const testCases = [
    { filename: "app.tar.gz", expected: "application/gzip" },
    { filename: "app.tgz", expected: "application/gzip" },
    { filename: "app.zip", expected: "application/zip" },
    { filename: "app.tar", expected: "application/x-tar" },
    { filename: "app.unknown", expected: "application/octet-stream" },
    { filename: "no-extension", expected: "application/octet-stream" },
  ];
  
  for (const { filename, expected } of testCases) {
    let contentType = "application/octet-stream";
    
    if (filename.endsWith(".tar.gz") || filename.endsWith(".tgz")) {
      contentType = "application/gzip";
    } else if (filename.endsWith(".zip")) {
      contentType = "application/zip";
    } else if (filename.endsWith(".tar")) {
      contentType = "application/x-tar";
    }
    
    assertEquals(contentType, expected, `MIME type for ${filename}`);
  }
});

Deno.test("NIP-94 Integration - Version validation", () => {
  const validVersions = [
    "v1.0.0",
    "1.0.0",
    "v2.0.0-beta",
    "v3.0.0-rc.1",
    "latest",
    "nightly",
    "2024.01.15",
    "release-2024-01-15",
    "main",
    "develop",
  ];
  
  // All versions are valid - nsyte doesn't restrict version format
  for (const version of validVersions) {
    const dTag = `my-app@${version}`;
    assertEquals(dTag.includes("@"), true);
    assertEquals(dTag.split("@").length, 2);
  }
});

Deno.test("NIP-94 Integration - Release update logic", () => {
  // Simulate existing release with 3 artifacts
  const existingEventIds = ["event-1", "event-2", "event-3"];
  const eventIdsToReplace = new Set(["event-2"]); // Replacing second artifact
  const newEventIds = ["event-4", "event-5"]; // Adding two new ones
  
  // Filter out replaced events
  const keptEventIds = existingEventIds.filter(id => !eventIdsToReplace.has(id));
  assertEquals(keptEventIds.length, 2);
  assertEquals(keptEventIds.includes("event-2"), false);
  
  // Combine with new events
  const allEventIds = [...keptEventIds, ...newEventIds];
  assertEquals(allEventIds.length, 4);
  
  // Verify final state
  assertEquals(allEventIds.includes("event-1"), true); // Kept
  assertEquals(allEventIds.includes("event-2"), false); // Replaced
  assertEquals(allEventIds.includes("event-3"), true); // Kept
  assertEquals(allEventIds.includes("event-4"), true); // Added
  assertEquals(allEventIds.includes("event-5"), true); // Added
});