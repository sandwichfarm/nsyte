import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { join } from "std/path/mod.ts";
import {
  DEFAULT_IGNORE_PATTERNS,
  getLocalFiles,
  type FileEntry
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
      const filePaths = result.includedFiles.map(f => f.path);
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
        const filePaths = result.includedFiles.map(f => f.path);
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
      const file = result.includedFiles.find(f => f.path === "metadata-test.txt");
      
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
        { name: "page.html", type: "text/html; charset=utf-8" }
      ];
      
      for (const { name, type } of fileTypes) {
        await Deno.writeTextFile(join(tempDir, name), "content");
      }
      
      const result = await getLocalFiles(tempDir);
      
      for (const { name, type } of fileTypes) {
        const file = result.includedFiles.find(f => f.path === name);
        assertExists(file);
        assertEquals(file.contentType, type);
      }
    });

    await t.step("should handle deeply nested directories", async () => {
      const deepPath = join(tempDir, "a", "b", "c", "d");
      await Deno.mkdir(deepPath, { recursive: true });
      await Deno.writeTextFile(join(deepPath, "deep.txt"), "deep content");
      
      const result = await getLocalFiles(tempDir);
      const deepFile = result.includedFiles.find(f => f.path === "a/b/c/d/deep.txt");
      
      assertExists(deepFile);
      assertEquals(deepFile.path, "a/b/c/d/deep.txt");
    });

    await t.step("should handle special characters in filenames", async () => {
      const specialFiles = [
        "file with spaces.txt",
        "file-with-dashes.txt",
        "file_with_underscores.txt",
        "file.multiple.dots.txt",
        "漢字.txt" // Unicode characters
      ];
      
      for (const filename of specialFiles) {
        await Deno.writeTextFile(join(tempDir, filename), "content");
      }
      
      const result = await getLocalFiles(tempDir);
      
      for (const filename of specialFiles) {
        const file = result.includedFiles.find(f => f.path === filename);
        assertExists(file, `Should find file: ${filename}`);
      }
    });

    await t.step("should handle non-existent directory", async () => {
      await assertRejects(
        async () => {
          await getLocalFiles("/path/that/does/not/exist");
        },
        Error
      );
    });
  } finally {
    // Clean up temp directory
    await Deno.remove(tempDir, { recursive: true });
  }
});

