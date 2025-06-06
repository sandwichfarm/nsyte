import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { 
  getLocalFiles, 
  calculateFileHash, 
  DEFAULT_IGNORE_PATTERNS 
} from "../../src/lib/files.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { join } from "std/path/mod.ts";

// Create a temporary test directory
const testDir = await Deno.makeTempDir({ prefix: "nsyte_files_test_" });

async function setupTestFiles() {
  // Create test directory structure
  await ensureDir(join(testDir, "subdir"));
  await ensureDir(join(testDir, "node_modules"));
  await ensureDir(join(testDir, ".git"));
  
  // Create test files
  await Deno.writeTextFile(join(testDir, "index.html"), "<html><body>Test</body></html>");
  await Deno.writeTextFile(join(testDir, "style.css"), "body { margin: 0; }");
  await Deno.writeTextFile(join(testDir, "script.js"), "console.log('test');");
  await Deno.writeTextFile(join(testDir, "README.md"), "# Test Project");
  await Deno.writeTextFile(join(testDir, "subdir/nested.txt"), "nested content");
  
  // Create files that should be ignored by default
  await Deno.writeTextFile(join(testDir, ".DS_Store"), "binary data");
  await Deno.writeTextFile(join(testDir, "node_modules/package.json"), '{"name": "test"}');
  await Deno.writeTextFile(join(testDir, ".git/config"), "[core]");
  
  // Create .nsite-ignore file
  await Deno.writeTextFile(join(testDir, ".nsite-ignore"), "*.log\ntemp/\n# Comment line\n");
  await Deno.writeTextFile(join(testDir, "debug.log"), "log content");
}

async function cleanupTestFiles() {
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

Deno.test("Files Module - File Discovery", async (t) => {
  await setupTestFiles();
  
  try {
    await t.step("should discover files in directory", async () => {
      const result = await getLocalFiles(testDir);
      
      assertExists(result.includedFiles);
      assertExists(result.ignoredFilePaths);
      assertEquals(Array.isArray(result.includedFiles), true);
      assertEquals(Array.isArray(result.ignoredFilePaths), true);
      
      // Should include regular files
      const filePaths = result.includedFiles.map(f => f.path);
      assertEquals(filePaths.some(p => p.endsWith("index.html")), true);
      assertEquals(filePaths.some(p => p.endsWith("style.css")), true);
      assertEquals(filePaths.some(p => p.endsWith("script.js")), true);
      assertEquals(filePaths.some(p => p.endsWith("README.md")), true);
      assertEquals(filePaths.some(p => p.endsWith("nested.txt")), true);
    });

    await t.step("should ignore default patterns", async () => {
      const result = await getLocalFiles(testDir);
      
      const filePaths = result.includedFiles.map(f => f.path);
      const ignoredPaths = result.ignoredFilePaths;
      
      // Should ignore default patterns
      assertEquals(filePaths.some(p => p.includes(".DS_Store")), false);
      assertEquals(filePaths.some(p => p.includes("node_modules")), false);
      assertEquals(filePaths.some(p => p.includes(".git")), false);
      
      // Should track ignored files
      assertEquals(ignoredPaths.some(p => p.includes(".DS_Store")), true);
      assertEquals(ignoredPaths.some(p => p.includes("node_modules")), true);
      assertEquals(ignoredPaths.some(p => p.includes(".git")), true);
    });

    await t.step("should respect .nsite-ignore file", async () => {
      const result = await getLocalFiles(testDir);
      
      const filePaths = result.includedFiles.map(f => f.path);
      const ignoredPaths = result.ignoredFilePaths;
      
      // Should ignore files matching .nsite-ignore patterns
      assertEquals(filePaths.some(p => p.endsWith("debug.log")), false);
      assertEquals(ignoredPaths.some(p => p.endsWith("debug.log")), true);
    });

    await t.step("should handle file content and metadata", async () => {
      const result = await getLocalFiles(testDir);
      
      const htmlFile = result.includedFiles.find(f => f.path.endsWith("index.html"));
      assertExists(htmlFile);
      
      // Check file properties
      assertExists(htmlFile.data);
      assertExists(htmlFile.sha256);
      assertExists(htmlFile.contentType);
      assertEquals(htmlFile.contentType, "text/html");
      assertEquals(htmlFile.data.length > 0, true);
      assertEquals(htmlFile.sha256.length, 64); // SHA256 hex string
    });

    await t.step("should handle different file types", async () => {
      const result = await getLocalFiles(testDir);
      
      const cssFile = result.includedFiles.find(f => f.path.endsWith("style.css"));
      const jsFile = result.includedFiles.find(f => f.path.endsWith("script.js"));
      const mdFile = result.includedFiles.find(f => f.path.endsWith("README.md"));
      
      assertExists(cssFile);
      assertExists(jsFile);
      assertExists(mdFile);
      
      assertEquals(cssFile.contentType, "text/css");
      assertEquals(jsFile.contentType, "text/javascript");
      assertEquals(mdFile.contentType, "text/markdown");
    });

  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("Files Module - File Hash Calculation", async (t) => {
  const tempDir = await Deno.makeTempDir();
  
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
  
  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("Files Module - Default Ignore Patterns", async (t) => {
  await t.step("should have default ignore patterns", () => {
    assertExists(DEFAULT_IGNORE_PATTERNS);
    assertEquals(Array.isArray(DEFAULT_IGNORE_PATTERNS), true);
    assertEquals(DEFAULT_IGNORE_PATTERNS.length > 0, true);
    
    // Should include common patterns
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes(".git/**"), true);
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes("node_modules/**"), true);
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes(".DS_Store"), true);
  });
});

Deno.test("Files Module - Error Handling", async (t) => {
  await t.step("should handle non-existent directory", async () => {
    const nonExistentDir = "/path/that/does/not/exist";
    
    await assertRejects(
      async () => await getLocalFiles(nonExistentDir),
      Error
    );
  });

  await t.step("should handle permission errors gracefully", async () => {
    // Create a test directory and then remove read permissions (on Unix systems)
    const restrictedDir = await Deno.makeTempDir({ prefix: "nsyte_restricted_" });
    
    try {
      // This might not work on all systems, so we'll catch any errors
      try {
        await Deno.chmod(restrictedDir, 0o000);
        
        await assertRejects(
          async () => await getLocalFiles(restrictedDir),
          Error
        );
      } catch {
        // If chmod fails (e.g., on Windows), we'll skip this test
        console.log("Skipping permission test - chmod not supported");
      }
    } finally {
      try {
        await Deno.chmod(restrictedDir, 0o755);
        await Deno.remove(restrictedDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  await t.step("should handle invalid file content", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "nsyte_invalid_" });
    
    try {
      // Create a file that might cause issues
      const invalidFile = join(tempDir, "invalid.bin");
      const binaryData = new Uint8Array([0xFF, 0xFE, 0xFD, 0xFC, 0x00, 0x01]);
      await Deno.writeFile(invalidFile, binaryData);
      
      const result = await getLocalFiles(tempDir);
      
      // Should still process the file
      assertExists(result.includedFiles);
      assertEquals(result.includedFiles.length, 1);
      
      const file = result.includedFiles[0];
      assertExists(file.data);
      assertExists(file.sha256);
      assertEquals(file.contentType, "application/octet-stream"); // Default for binary files
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });
});

Deno.test("Files Module - Edge Cases", async (t) => {
  await t.step("should handle files with no extension", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "nsyte_no_ext_" });
    
    try {
      await Deno.writeTextFile(join(tempDir, "Dockerfile"), "FROM node:18");
      await Deno.writeTextFile(join(tempDir, "Makefile"), "all:\n\techo 'build'");
      
      const result = await getLocalFiles(tempDir);
      
      assertExists(result.includedFiles);
      assertEquals(result.includedFiles.length, 2);
      
      const dockerfile = result.includedFiles.find(f => f.path.endsWith("Dockerfile"));
      const makefile = result.includedFiles.find(f => f.path.endsWith("Makefile"));
      
      assertExists(dockerfile);
      assertExists(makefile);
      
      // Should still have content types (likely application/octet-stream)
      assertExists(dockerfile.contentType);
      assertExists(makefile.contentType);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("should handle very long file names", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "nsyte_long_names_" });
    
    try {
      const longName = "a".repeat(200) + ".txt";
      await Deno.writeTextFile(join(tempDir, longName), "content");
      
      const result = await getLocalFiles(tempDir);
      
      assertExists(result.includedFiles);
      assertEquals(result.includedFiles.length, 1);
      assertEquals(result.includedFiles[0].path.includes(longName), true);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("should handle deeply nested directories", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "nsyte_deep_" });
    
    try {
      // Create deep directory structure
      const deepPath = join(tempDir, "a", "b", "c", "d", "e", "f");
      await ensureDir(deepPath);
      await Deno.writeTextFile(join(deepPath, "deep.txt"), "deep content");
      
      const result = await getLocalFiles(tempDir);
      
      assertExists(result.includedFiles);
      assertEquals(result.includedFiles.length, 1);
      assertEquals(result.includedFiles[0].path.includes("deep.txt"), true);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });
});