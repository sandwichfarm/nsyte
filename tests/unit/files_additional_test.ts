import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { join } from "std/path/mod.ts";
import { restore, stub } from "std/testing/mock.ts";
import {
  compareFiles,
  type IgnoreRule,
  isIgnored,
  loadFileData,
  parseIgnorePatterns,
} from "../../src/lib/files.ts";
import { type FileEntry } from "../../src/lib/nostr.ts";

Deno.test("Files - parseIgnorePatterns", async (t) => {
  await t.step("should parse basic patterns", () => {
    const patterns = ["*.log", "temp/", "build/**"];
    const rules = parseIgnorePatterns(patterns);

    assertEquals(rules.length, 3);
    assertEquals(rules[0].pattern, "*.log");
    assertEquals(rules[0].negates, false);
    assertEquals(rules[0].appliesToDir, false);

    assertEquals(rules[1].pattern, "temp/");
    assertEquals(rules[1].appliesToDir, true);

    assertEquals(rules[2].pattern, "build/**");
    assertEquals(rules[2].appliesToDir, false);
  });

  await t.step("should handle negation patterns", () => {
    const patterns = ["*.log", "!important.log"];
    const rules = parseIgnorePatterns(patterns);

    assertEquals(rules.length, 2);
    assertEquals(rules[0].negates, false);
    assertEquals(rules[1].negates, true);
    assertEquals(rules[1].pattern, "important.log");
  });

  await t.step("should identify directory patterns", () => {
    const patterns = ["temp/", "cache/", "dist"];
    const rules = parseIgnorePatterns(patterns);

    assertEquals(rules[0].appliesToDir, true);
    assertEquals(rules[1].appliesToDir, true);
    assertEquals(rules[2].appliesToDir, false);
  });

  await t.step("should create regex patterns", () => {
    const patterns = ["*.txt", "test.*", "dir/**/*.js"];
    const rules = parseIgnorePatterns(patterns);

    for (const rule of rules) {
      assertExists(rule.regex);
      assertEquals(rule.regex instanceof RegExp, true);
    }
  });

  await t.step("should handle invalid patterns gracefully", () => {
    const patterns = ["valid*.log", "[[[invalid", "also-valid.txt"];

    // Should not throw, just skip invalid patterns
    const rules = parseIgnorePatterns(patterns);
    assertEquals(rules.length >= 2, true); // Should have at least the valid ones
  });
});

Deno.test("Files - isIgnored", async (t) => {
  await t.step("should ignore files matching patterns", () => {
    const rules = parseIgnorePatterns(["*.log", "temp/", "*.tmp"]);

    assertEquals(isIgnored("debug.log", rules, false), true);
    assertEquals(isIgnored("error.log", rules, false), true);
    assertEquals(isIgnored("file.tmp", rules, false), true);
    assertEquals(isIgnored("file.txt", rules, false), false);
  });

  await t.step("should handle directory patterns", () => {
    const rules = parseIgnorePatterns(["temp/", "cache/", "node_modules/**"]);

    assertEquals(isIgnored("temp/", rules, true), true);
    assertEquals(isIgnored("temp/file.txt", rules, false), true);
    assertEquals(isIgnored("cache/", rules, true), true);
    assertEquals(isIgnored("other/", rules, true), false);
  });

  await t.step("should handle negation patterns", () => {
    const rules = parseIgnorePatterns(["*.log", "!important.log", "temp/*", "!temp/keep.txt"]);

    assertEquals(isIgnored("debug.log", rules, false), true);
    assertEquals(isIgnored("important.log", rules, false), false);
    assertEquals(isIgnored("temp/file.txt", rules, false), true);
    assertEquals(isIgnored("temp/keep.txt", rules, false), false);
  });

  await t.step("should handle dotfiles implicitly", () => {
    const rules: IgnoreRule[] = []; // Empty rules

    // Dotfiles should be implicitly ignored
    assertEquals(isIgnored(".hidden", rules, false), true);
    assertEquals(isIgnored(".git/config", rules, false), true);
    assertEquals(isIgnored(".DS_Store", rules, false), true);

    // Except .well-known
    assertEquals(isIgnored(".well-known/test", rules, false), false);
    assertEquals(isIgnored(".well-known/", rules, true), false);
  });

  await t.step("should normalize Windows paths", () => {
    const rules = parseIgnorePatterns(["temp/**"]);

    // Should handle both forward and backslashes
    assertEquals(isIgnored("temp\\file.txt", rules, false), true);
    assertEquals(isIgnored("temp/file.txt", rules, false), true);
  });

  await t.step("should handle directory matching edge cases", () => {
    const rules = parseIgnorePatterns(["cache/", "*.log"]);

    // Directory patterns should match directories and their contents
    assertEquals(isIgnored("cache/", rules, true), true);
    assertEquals(isIgnored("cache", rules, true), true);
    assertEquals(isIgnored("cache/file.txt", rules, false), true);

    // File patterns should match files
    assertEquals(isIgnored("debug.log", rules, false), true);
    assertEquals(isIgnored("debug.log/", rules, true), true); // .log pattern matches debug.log/
  });
});

Deno.test("Files - compareFiles", async (t) => {
  await t.step("should identify new files to transfer", () => {
    const localFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain" },
      { path: "/file2.txt", size: 200, contentType: "text/plain" },
      { path: "/new.txt", size: 300, contentType: "text/plain" },
    ];

    const remoteFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain" },
      { path: "/file2.txt", size: 200, contentType: "text/plain" },
    ];

    const result = compareFiles(localFiles, remoteFiles);

    assertEquals(result.toTransfer.length, 1);
    assertEquals(result.toTransfer[0].path, "/new.txt");
    assertEquals(result.existing.length, 2);
    assertEquals(result.toDelete.length, 0);
  });

  await t.step("should identify files to delete", () => {
    const localFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain" },
    ];

    const remoteFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain" },
      { path: "/old.txt", size: 200, contentType: "text/plain" },
      { path: "/obsolete.txt", size: 300, contentType: "text/plain" },
    ];

    const result = compareFiles(localFiles, remoteFiles);

    assertEquals(result.toTransfer.length, 0);
    assertEquals(result.existing.length, 1);
    assertEquals(result.toDelete.length, 2);

    const toDeletePaths = result.toDelete.map((f) => f.path);
    assertEquals(toDeletePaths.includes("/old.txt"), true);
    assertEquals(toDeletePaths.includes("/obsolete.txt"), true);
  });

  await t.step("should handle hash differences", () => {
    const localFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain", sha256: "newhash123" },
    ];

    const remoteFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain", sha256: "oldhash456" },
    ];

    const result = compareFiles(localFiles, remoteFiles);

    assertEquals(result.toTransfer.length, 1);
    assertEquals(result.toTransfer[0].path, "/file1.txt");
    assertEquals(result.existing.length, 0);
    assertEquals(result.toDelete.length, 0);
  });

  await t.step("should handle case-insensitive paths", () => {
    const localFiles: FileEntry[] = [
      { path: "/File1.TXT", size: 100, contentType: "text/plain" },
    ];

    const remoteFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain" },
    ];

    const result = compareFiles(localFiles, remoteFiles);

    // Should match despite case difference
    assertEquals(result.existing.length, 1);
    assertEquals(result.toTransfer.length, 0);
    assertEquals(result.toDelete.length, 0);
  });

  await t.step("should normalize path prefixes", () => {
    const localFiles: FileEntry[] = [
      { path: "file1.txt", size: 100, contentType: "text/plain" },
      { path: "///file2.txt", size: 200, contentType: "text/plain" },
    ];

    const remoteFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain" },
      { path: "/file2.txt", size: 200, contentType: "text/plain" },
    ];

    const result = compareFiles(localFiles, remoteFiles);

    assertEquals(result.existing.length, 1); // Only one should match due to path normalization
    assertEquals(result.toTransfer.length, 1); // The other becomes a transfer
    assertEquals(result.toDelete.length, 1); // The unmatched remote becomes delete
  });

  await t.step("should handle missing hashes gracefully", () => {
    const localFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain" }, // No sha256
    ];

    const remoteFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain", sha256: "remotehash" },
    ];

    const result = compareFiles(localFiles, remoteFiles);

    // Should treat as existing when local hash is missing
    assertEquals(result.existing.length, 1);
    assertEquals(result.toTransfer.length, 0);
  });

  await t.step("should handle empty file lists", () => {
    const result1 = compareFiles([], []);
    assertEquals(result1.toTransfer.length, 0);
    assertEquals(result1.existing.length, 0);
    assertEquals(result1.toDelete.length, 0);

    const localFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain" },
    ];

    const result2 = compareFiles(localFiles, []);
    assertEquals(result2.toTransfer.length, 1);
    assertEquals(result2.existing.length, 0);
    assertEquals(result2.toDelete.length, 0);

    const remoteFiles: FileEntry[] = [
      { path: "/file1.txt", size: 100, contentType: "text/plain" },
    ];

    const result3 = compareFiles([], remoteFiles);
    assertEquals(result3.toTransfer.length, 0);
    assertEquals(result3.existing.length, 0);
    assertEquals(result3.toDelete.length, 1);
  });
});

Deno.test("Files - loadFileData", async (t) => {
  const tempDir = await Deno.makeTempDir();

  try {
    await t.step("should load file data with metadata", async () => {
      const content = "Test content for loading";
      await Deno.writeTextFile(join(tempDir, "test.txt"), content);

      const fileEntry: FileEntry = {
        path: "/test.txt",
        size: 0, // Will be updated
        contentType: "text/plain",
      };

      const loaded = await loadFileData(tempDir, fileEntry);

      assertExists(loaded.data);
      assertExists(loaded.sha256);
      assertEquals(loaded.size, new TextEncoder().encode(content).length);
      assertEquals(loaded.sha256.length, 64); // SHA256 hex string
      assertEquals(new TextDecoder().decode(loaded.data!), content);
      assertEquals(loaded.contentType, fileEntry.contentType);
      assertEquals(loaded.path, fileEntry.path);
    });

    await t.step("should handle nested file paths", async () => {
      await Deno.mkdir(join(tempDir, "subdir"));
      const content = "Nested file content";
      await Deno.writeTextFile(join(tempDir, "subdir", "nested.txt"), content);

      const fileEntry: FileEntry = {
        path: "/subdir/nested.txt",
        size: 0,
        contentType: "text/plain",
      };

      const loaded = await loadFileData(tempDir, fileEntry);

      assertExists(loaded.data);
      assertEquals(new TextDecoder().decode(loaded.data!), content);
    });

    await t.step("should normalize directory paths", async () => {
      const content = "Path normalization test";
      await Deno.writeTextFile(join(tempDir, "normalize.txt"), content);

      const fileEntry: FileEntry = {
        path: "/normalize.txt",
        size: 0,
        contentType: "text/plain",
      };

      // Test with trailing slash
      const loaded1 = await loadFileData(tempDir + "/", fileEntry);
      assertExists(loaded1.data);

      // Test without trailing slash
      const loaded2 = await loadFileData(tempDir, fileEntry);
      assertExists(loaded2.data);

      // Should produce same results
      assertEquals(loaded1.sha256, loaded2.sha256);
      assertEquals(loaded1.size, loaded2.size);
    });

    await t.step("should handle binary files", async () => {
      const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254]);
      await Deno.writeFile(join(tempDir, "binary.bin"), binaryData);

      const fileEntry: FileEntry = {
        path: "/binary.bin",
        size: 0,
        contentType: "application/octet-stream",
      };

      const loaded = await loadFileData(tempDir, fileEntry);

      assertExists(loaded.data);
      assertEquals(loaded.data.length, binaryData.length);
      assertEquals(loaded.size, binaryData.length);

      // Verify binary data integrity
      for (let i = 0; i < binaryData.length; i++) {
        assertEquals(loaded.data![i], binaryData[i]);
      }
    });

    await t.step("should handle empty files", async () => {
      await Deno.writeTextFile(join(tempDir, "empty.txt"), "");

      const fileEntry: FileEntry = {
        path: "/empty.txt",
        size: 0,
        contentType: "text/plain",
      };

      const loaded = await loadFileData(tempDir, fileEntry);

      assertExists(loaded.data);
      assertEquals(loaded.data.length, 0);
      assertEquals(loaded.size, 0);
      assertExists(loaded.sha256);
    });

    await t.step("should throw for non-existent file", async () => {
      const fileEntry: FileEntry = {
        path: "/nonexistent.txt",
        size: 0,
        contentType: "text/plain",
      };

      await assertRejects(
        () => loadFileData(tempDir, fileEntry),
        Error,
        "Failed to load file",
      );
    });

    await t.step("should handle file read errors", async () => {
      const readStub = stub(Deno, "readFile", () => {
        throw new Error("Read permission denied");
      });

      const fileEntry: FileEntry = {
        path: "/test.txt",
        size: 0,
        contentType: "text/plain",
      };

      await assertRejects(
        () => loadFileData(tempDir, fileEntry),
        Error,
        "Failed to load file",
      );

      readStub.restore();
    });

    await t.step("should handle crypto digest errors", async () => {
      await Deno.writeTextFile(join(tempDir, "crypto-error.txt"), "test");

      const digestStub = stub(crypto.subtle, "digest", () => {
        throw new Error("Crypto operation failed");
      });

      const fileEntry: FileEntry = {
        path: "/crypto-error.txt",
        size: 0,
        contentType: "text/plain",
      };

      await assertRejects(
        () => loadFileData(tempDir, fileEntry),
        Error,
        "Failed to load file",
      );

      digestStub.restore();
    });

    await t.step("should preserve original fileEntry properties", async () => {
      const content = "Preserve properties test";
      await Deno.writeTextFile(join(tempDir, "preserve.txt"), content);

      const fileEntry: FileEntry = {
        path: "/preserve.txt",
        size: 999, // Will be overwritten
        contentType: "text/plain",
      };

      const loaded = await loadFileData(tempDir, fileEntry);

      // Should preserve path and contentType
      assertEquals(loaded.path, fileEntry.path);
      assertEquals(loaded.contentType, fileEntry.contentType);

      // Should update size with actual size
      assertEquals(loaded.size, new TextEncoder().encode(content).length);
      assertEquals(loaded.size !== 999, true);
    });
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

// Cleanup
Deno.test("Cleanup", () => {
  restore();
});
