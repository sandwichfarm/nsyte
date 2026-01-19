import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { restore, stub } from "jsr:@std/testing/mock";
import {
  calculateFileHash,
  compareFiles,
  DEFAULT_IGNORE_PATTERNS,
  type FileEntry,
  getLocalFiles,
  type IgnoreRule,
  isIgnored,
  loadFileData,
  parseIgnorePatterns,
} from "../../src/lib/files.ts";

Deno.test("files constants", async (t) => {
  await t.step("should export default ignore patterns", () => {
    assertExists(DEFAULT_IGNORE_PATTERNS);
    assertEquals(Array.isArray(DEFAULT_IGNORE_PATTERNS), true);
    assertEquals(DEFAULT_IGNORE_PATTERNS.length > 0, true);

    // Check some expected patterns
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes(".git/**"), true);
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes(".DS_Store"), true);
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes("node_modules/**"), true);
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes(".nsite-ignore"), true);
  });
});

Deno.test("getLocalFiles", async (t) => {
  // Create a temporary test directory
  const tempDir = await Deno.makeTempDir();

  try {
    await t.step("should scan empty directory", async () => {
      const result = await getLocalFiles(tempDir);

      assertExists(result);
      assertExists(result.includedFiles);
      assertExists(result.ignoredFilePaths);
      assertEquals(Array.isArray(result.includedFiles), true);
      assertEquals(Array.isArray(result.ignoredFilePaths), true);
      assertEquals(result.includedFiles.length, 0);
      assertEquals(result.ignoredFilePaths.length, 0);
    });

    await t.step("should scan directory with files", async () => {
      // Create some test files
      await Deno.writeTextFile(join(tempDir, "test1.txt"), "Hello");
      await Deno.writeTextFile(join(tempDir, "test2.js"), "console.log('test');");
      await Deno.mkdir(join(tempDir, "subdir"));
      await Deno.writeTextFile(join(tempDir, "subdir", "test3.md"), "# Test");

      const result = await getLocalFiles(tempDir);

      assertEquals(result.includedFiles.length, 3);
      assertEquals(result.ignoredFilePaths.length, 0);

      // Check file properties
      const filePaths = result.includedFiles.map((f) => f.path);
      assertEquals(filePaths.includes("test1.txt"), true);
      assertEquals(filePaths.includes("test2.js"), true);
      assertEquals(filePaths.includes("subdir/test3.md"), true);
    });

    await t.step("should respect default ignore patterns", async () => {
      // Create files that should be ignored
      await Deno.mkdir(join(tempDir, ".git"));
      await Deno.writeTextFile(join(tempDir, ".git", "config"), "git config");
      await Deno.writeTextFile(join(tempDir, ".DS_Store"), "");
      await Deno.mkdir(join(tempDir, "node_modules"));
      await Deno.writeTextFile(join(tempDir, "node_modules", "package.json"), "{}");

      const result = await getLocalFiles(tempDir);

      // Should still have only the 3 non-ignored files from previous test
      assertEquals(result.includedFiles.length, 3);

      // Check that ignored paths are tracked
      assertEquals(result.ignoredFilePaths.length > 0, true);
    });

    await t.step("should handle .nsite-ignore file", async () => {
      // Create .nsite-ignore in current directory
      const ignoreContent = "*.log\ntemp/\n# Comment line\n*.tmp";
      await Deno.writeTextFile(join(Deno.cwd(), ".nsite-ignore"), ignoreContent);

      // Create files that should be ignored
      await Deno.writeTextFile(join(tempDir, "debug.log"), "log content");
      await Deno.writeTextFile(join(tempDir, "file.tmp"), "temp content");
      await Deno.mkdir(join(tempDir, "temp"));
      await Deno.writeTextFile(join(tempDir, "temp", "data.txt"), "temp data");

      try {
        const result = await getLocalFiles(tempDir);

        // Should not include ignored files
        const filePaths = result.includedFiles.map((f) => f.path);
        assertEquals(filePaths.includes("debug.log"), false);
        assertEquals(filePaths.includes("file.tmp"), false);
        assertEquals(filePaths.includes("temp/data.txt"), false);

        // Should track ignored paths
        assertEquals(result.ignoredFilePaths.includes("debug.log"), true);
        assertEquals(result.ignoredFilePaths.includes("file.tmp"), true);
      } finally {
        // Clean up .nsite-ignore
        await Deno.remove(join(Deno.cwd(), ".nsite-ignore"));
      }
    });

    await t.step("should handle file metadata", async () => {
      const testFile = join(tempDir, "metadata-test.txt");
      const testContent = "Test content for metadata";
      await Deno.writeTextFile(testFile, testContent);

      const result = await getLocalFiles(tempDir);
      const file = result.includedFiles.find((f) => f.path === "metadata-test.txt");

      assertExists(file);
      assertEquals(file.path, "metadata-test.txt");
      assertExists(file.size);
      assertEquals(file.size, new TextEncoder().encode(testContent).length);
      assertExists(file.sha256);
      assertEquals(typeof file.sha256, "string");
      assertEquals(file.sha256.length, 64); // SHA256 hex string
      assertExists(file.contentType);
      assertEquals(file.contentType, "text/plain; charset=utf-8");
    });

    await t.step("should handle various file types", async () => {
      const fileTypes = [
        { name: "image.png", type: "image/png" },
        { name: "script.js", type: "text/javascript; charset=utf-8" },
        { name: "styles.css", type: "text/css; charset=utf-8" },
        { name: "data.json", type: "application/json" },
        { name: "page.html", type: "text/html; charset=utf-8" },
      ];

      for (const { name, type } of fileTypes) {
        await Deno.writeTextFile(join(tempDir, name), "content");
      }

      const result = await getLocalFiles(tempDir);

      for (const { name, type } of fileTypes) {
        const file = result.includedFiles.find((f) => f.path === name);
        assertExists(file);
        assertEquals(file.contentType, type);
      }
    });

    await t.step("should handle deeply nested directories", async () => {
      const deepPath = join(tempDir, "a", "b", "c", "d");
      await Deno.mkdir(deepPath, { recursive: true });
      await Deno.writeTextFile(join(deepPath, "deep.txt"), "deep content");

      const result = await getLocalFiles(tempDir);
      const deepFile = result.includedFiles.find((f) => f.path === "a/b/c/d/deep.txt");

      assertExists(deepFile);
      assertEquals(deepFile.path, "a/b/c/d/deep.txt");
    });

    await t.step("should handle special characters in filenames", async () => {
      const specialFiles = [
        "file with spaces.txt",
        "file-with-dashes.txt",
        "file_with_underscores.txt",
        "file.multiple.dots.txt",
        "漢字.txt", // Unicode characters
      ];

      for (const filename of specialFiles) {
        await Deno.writeTextFile(join(tempDir, filename), "content");
      }

      const result = await getLocalFiles(tempDir);

      for (const filename of specialFiles) {
        const file = result.includedFiles.find((f) => f.path === filename);
        assertExists(file, `Should find file: ${filename}`);
      }
    });

    await t.step("should handle non-existent directory", async () => {
      await assertRejects(
        async () => {
          await getLocalFiles("/path/that/does/not/exist");
        },
        Error,
      );
    });
  } finally {
    // Clean up temp directory
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("calculateFileHash", async (t) => {
  const tempDir = await Deno.makeTempDir();

  try {
    await t.step("should calculate file hash correctly", async () => {
      const testFile = join(tempDir, "test.txt");
      await Deno.writeTextFile(testFile, "Hello, World!");

      const hash = await calculateFileHash(testFile);

      assertExists(hash);
      assertEquals(typeof hash, "string");
      assertEquals(hash.length, 64);

      // Known SHA256 hash for "Hello, World!"
      const expectedHash = "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f";
      assertEquals(hash, expectedHash);
    });

    await t.step("should produce consistent hashes", async () => {
      const testFile = join(tempDir, "test2.txt");
      await Deno.writeTextFile(testFile, "Test content for consistency");

      const hash1 = await calculateFileHash(testFile);
      const hash2 = await calculateFileHash(testFile);

      assertEquals(hash1, hash2);
    });

    await t.step("should handle empty files", async () => {
      const emptyFile = join(tempDir, "empty.txt");
      await Deno.writeTextFile(emptyFile, "");

      const hash = await calculateFileHash(emptyFile);

      assertExists(hash);
      assertEquals(hash.length, 64);

      // Known SHA256 hash for empty string
      const expectedHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      assertEquals(hash, expectedHash);
    });

    await t.step("should handle large files", async () => {
      const largeFile = join(tempDir, "large.txt");
      const largeContent = "x".repeat(1000000); // 1MB of 'x'
      await Deno.writeTextFile(largeFile, largeContent);

      const hash = await calculateFileHash(largeFile);

      assertExists(hash);
      assertEquals(hash.length, 64);
    });

    await t.step("should handle binary files", async () => {
      const binaryFile = join(tempDir, "binary.bin");
      const binaryData = new Uint8Array([0xFF, 0xFE, 0xFD, 0xFC, 0x00, 0x01]);
      await Deno.writeFile(binaryFile, binaryData);

      const hash = await calculateFileHash(binaryFile);

      assertExists(hash);
      assertEquals(hash.length, 64);
    });

    await t.step("should throw error for non-existent file", async () => {
      await assertRejects(
        async () => {
          await calculateFileHash(join(tempDir, "non-existent.txt"));
        },
        Error,
      );
    });
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("parseIgnorePatterns", async (t) => {
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

Deno.test("isIgnored", async (t) => {
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
});

Deno.test("compareFiles", async (t) => {
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

Deno.test("loadFileData", async (t) => {
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

      try {
        await assertRejects(
          () => loadFileData(tempDir, fileEntry),
          Error,
          "Failed to load file",
        );
      } finally {
        readStub.restore();
      }
    });
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
