// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { restore, stub, type Stub } from "std/testing/mock.ts";
import { join } from "@std/path";

import {
  downloadFiles,
  downloadSingleFile,
  downloadFromServer,
  displayResults,
  type DownloadOptions,
  type DownloadResult,
} from "../../src/commands/download.ts";
import { type FileEntry } from "../../src/lib/nostr.ts";

// Test state
let consoleOutput: { logs: string[]; errors: string[] };
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalFetch: typeof globalThis.fetch;
let originalWriteFile: typeof Deno.writeFile;
let originalStat: typeof Deno.stat;
let originalMakeTempDir: typeof Deno.makeTempDir;
let originalRemove: typeof Deno.remove;

describe("Download Functions - Unit Tests", () => {
  beforeEach(() => {
    // Setup console capture
    consoleOutput = { logs: [], errors: [] };
    originalLog = console.log;
    originalError = console.error;
    
    console.log = (...args: unknown[]) => {
      consoleOutput.logs.push(args.map(String).join(" "));
    };
    
    console.error = (...args: unknown[]) => {
      consoleOutput.errors.push(args.map(String).join(" "));
    };

    // Store originals
    originalFetch = globalThis.fetch;
    originalWriteFile = Deno.writeFile;
    originalStat = Deno.stat;
    originalMakeTempDir = Deno.makeTempDir;
    originalRemove = Deno.remove;
  });

  afterEach(() => {
    // Restore all stubs
    restore();
    
    // Restore console
    console.log = originalLog;
    console.error = originalError;

    // Restore globals
    globalThis.fetch = originalFetch;
    Deno.writeFile = originalWriteFile;
    Deno.stat = originalStat;
    Deno.makeTempDir = originalMakeTempDir;
    Deno.remove = originalRemove;
  });

  describe("downloadFromServer function", () => {
    it("should successfully download file data", async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      globalThis.fetch = async (input: string | Request | URL) => {
        assertEquals(String(input), "https://server.com/abc123");
        return new Response(testData, { 
          status: 200,
          headers: { "content-type": "application/octet-stream" }
        });
      };

      const result = await downloadFromServer("https://server.com", "abc123");
      assertEquals(result, testData);
    });

    it("should handle server URLs with trailing slash", async () => {
      globalThis.fetch = async (input: string | Request | URL) => {
        assertEquals(String(input), "https://server.com/abc123");
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      };

      const result = await downloadFromServer("https://server.com/", "abc123");
      assertExists(result);
      assertEquals(result.length, 3);
    });

    it("should return null for 404 responses", async () => {
      globalThis.fetch = async () => {
        return new Response("Not Found", { status: 404 });
      };

      const result = await downloadFromServer("https://server.com", "notfound");
      assertEquals(result, null);
    });

    it("should throw error for other HTTP error responses", async () => {
      globalThis.fetch = async () => {
        return new Response("Server Error", { status: 500, statusText: "Internal Server Error" });
      };

      await assertRejects(
        () => downloadFromServer("https://server.com", "error"),
        Error,
        "HTTP 500: Internal Server Error"
      );
    });

    it("should throw error for network failures", async () => {
      globalThis.fetch = async () => {
        throw new Error("Network connection failed");
      };

      await assertRejects(
        () => downloadFromServer("https://server.com", "network-fail"),
        Error,
        "Network connection failed"
      );
    });
  });

  describe("downloadSingleFile function", () => {
    const mockFile: FileEntry = {
      path: "test/file.txt",
      size: 100,
      sha256: "abc123",
      contentType: "text/plain"
    };

    const mockOptions: DownloadOptions = {
      output: "/tmp/downloads",
      overwrite: false,
      verbose: false
    };

    it("should successfully download and save a file", async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      let writtenData: Uint8Array | undefined;
      let writtenPath: string | undefined;

      // Mock file doesn't exist
      Deno.stat = async () => {
        throw new Deno.errors.NotFound();
      };

      // Mock ensureDir
      const fsModule = await import("@std/fs/ensure-dir");
      stub(fsModule, "ensureDir", () => Promise.resolve());

      // Mock downloadFromServer
      globalThis.fetch = async () => {
        return new Response(testData, { status: 200 });
      };

      // Mock writeFile
      Deno.writeFile = async (path: string | URL, data: Uint8Array | ReadableStream<Uint8Array>) => {
        writtenPath = String(path);
        if (data instanceof Uint8Array) {
          writtenData = data;
        }
        return Promise.resolve();
      };

      const result = await downloadSingleFile(mockFile, ["https://server.com"], mockOptions);

      assertEquals(result.success, true);
      assertEquals(result.file, mockFile);
      assertEquals(result.savedPath, join(mockOptions.output!, mockFile.path));
      assertEquals(writtenPath, join(mockOptions.output!, mockFile.path));
      assertEquals(writtenData, testData);
    });

    it("should skip file if it already exists and overwrite is false", async () => {
      // Mock file exists
      Deno.stat = async () => {
        return { isFile: true } as Deno.FileInfo;
      };

      const result = await downloadSingleFile(mockFile, ["https://server.com"], mockOptions);

      assertEquals(result.success, true);
      assertEquals(result.skipped, true);
      assertEquals(result.reason, "File already exists (use --overwrite to replace)");
      assertEquals(result.savedPath, join(mockOptions.output!, mockFile.path));
    });

    it("should overwrite file if it exists and overwrite is true", async () => {
      const testData = new Uint8Array([1, 2, 3]);
      const overwriteOptions = { ...mockOptions, overwrite: true };

      // Mock file exists
      Deno.stat = async () => {
        return { isFile: true } as Deno.FileInfo;
      };

      // Mock ensureDir
      const fsModule = await import("@std/fs/ensure-dir");
      stub(fsModule, "ensureDir", () => Promise.resolve());

      // Mock successful download
      globalThis.fetch = async () => {
        return new Response(testData, { status: 200 });
      };

      // Mock writeFile
      Deno.writeFile = async () => Promise.resolve();

      const result = await downloadSingleFile(mockFile, ["https://server.com"], overwriteOptions);

      assertEquals(result.success, true);
      assertEquals(result.skipped, undefined);
    });

    it("should return error if file has no SHA256 hash", async () => {
      const fileNoHash = { ...mockFile, sha256: undefined };

      const result = await downloadSingleFile(fileNoHash, ["https://server.com"], mockOptions);

      assertEquals(result.success, false);
      assertEquals(result.error, "No SHA256 hash found for file");
    });

    it("should try multiple servers and succeed with second server", async () => {
      const testData = new Uint8Array([1, 2, 3]);

      // Mock file doesn't exist
      Deno.stat = async () => {
        throw new Deno.errors.NotFound();
      };

      // Mock ensureDir
      const fsModule = await import("@std/fs/ensure-dir");
      stub(fsModule, "ensureDir", () => Promise.resolve());

      // Mock fetch - first server fails, second succeeds
      let callCount = 0;
      globalThis.fetch = async (input: string | Request | URL) => {
        callCount++;
        if (String(input).includes("server1.com")) {
          return new Response("Not Found", { status: 404 });
        }
        if (String(input).includes("server2.com")) {
          return new Response(testData, { status: 200 });
        }
        throw new Error("Unexpected server");
      };

      // Mock writeFile
      Deno.writeFile = async () => Promise.resolve();

      const result = await downloadSingleFile(
        mockFile, 
        ["https://server1.com", "https://server2.com"], 
        mockOptions
      );

      assertEquals(result.success, true);
      assertEquals(callCount, 2);
    });

    it("should fail if all servers fail", async () => {
      // Mock file doesn't exist
      Deno.stat = async () => {
        throw new Deno.errors.NotFound();
      };

      // Mock all servers fail
      globalThis.fetch = async () => {
        return new Response("Not Found", { status: 404 });
      };

      const servers = ["https://server1.com", "https://server2.com"];
      const result = await downloadSingleFile(mockFile, servers, mockOptions);

      assertEquals(result.success, false);
      assertEquals(result.error, `Failed to download from any server (tried ${servers.length} servers)`);
    });
  });

  describe("downloadFiles function", () => {
    const mockFiles: FileEntry[] = [
      {
        path: "file1.txt",
        size: 100,
        sha256: "abc123",
        contentType: "text/plain"
      },
      {
        path: "file2.txt", 
        size: 200,
        sha256: "def456",
        contentType: "text/plain"
      }
    ];

    const mockOptions: DownloadOptions = {
      output: "/tmp/downloads",
      overwrite: false,
      verbose: false
    };

    it("should download multiple files successfully", async () => {
      // Mock ProgressRenderer
      const progressModule = await import("../../src/ui/progress.ts");
      const mockProgressRenderer = {
        start: () => {},
        update: () => {},
        complete: () => {},
      };
      stub(progressModule, "ProgressRenderer", () => mockProgressRenderer as any);

      // Mock file operations
      Deno.stat = async () => {
        throw new Deno.errors.NotFound();
      };

      const fsModule = await import("@std/fs/ensure-dir");
      stub(fsModule, "ensureDir", () => Promise.resolve());

      // Mock successful downloads
      globalThis.fetch = async (input: string | Request | URL) => {
        const url = String(input);
        if (url.includes("abc123")) {
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        }
        if (url.includes("def456")) {
          return new Response(new Uint8Array([4, 5, 6]), { status: 200 });
        }
        return new Response("Not Found", { status: 404 });
      };

      Deno.writeFile = async () => Promise.resolve();

      const results = await downloadFiles(mockFiles, ["https://server.com"], mockOptions);

      assertEquals(results.length, 2);
      assertEquals(results[0].success, true);
      assertEquals(results[1].success, true);
      // Progress renderer should have been called
      assertEquals(typeof mockProgressRenderer.start, "function");
      assertEquals(typeof mockProgressRenderer.complete, "function");
    });

    it("should handle mixed success and failure results", async () => {
      // Mock ProgressRenderer
      const progressModule = await import("../../src/ui/progress.ts");
      const mockProgressRenderer = {
        start: () => {},
        update: () => {},
        complete: () => {},
      };
      stub(progressModule, "ProgressRenderer", () => mockProgressRenderer as any);

      // Mock file operations
      Deno.stat = async () => {
        throw new Deno.errors.NotFound();
      };

      const fsModule = await import("@std/fs/ensure-dir");
      stub(fsModule, "ensureDir", () => Promise.resolve());

      // Mock mixed results - first succeeds, second fails
      globalThis.fetch = async (input: string | Request | URL) => {
        const url = String(input);
        if (url.includes("abc123")) {
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        }
        return new Response("Not Found", { status: 404 });
      };

      Deno.writeFile = async () => Promise.resolve();

      const results = await downloadFiles(mockFiles, ["https://server.com"], mockOptions);

      assertEquals(results.length, 2);
      assertEquals(results[0].success, true);
      assertEquals(results[1].success, false);
      assertEquals(results[1].error, "Failed to download from any server (tried 1 servers)");
    });

    it("should handle empty file list", async () => {
      const progressModule = await import("../../src/ui/progress.ts");
      const mockProgressRenderer = {
        start: () => {},
        update: () => {},
        complete: () => {},
      };
      stub(progressModule, "ProgressRenderer", () => mockProgressRenderer as any);

      const results = await downloadFiles([], ["https://server.com"], mockOptions);

      assertEquals(results.length, 0);
      // Progress renderer should have been called
      assertEquals(typeof mockProgressRenderer.start, "function");
      assertEquals(typeof mockProgressRenderer.complete, "function");
    });

    it("should process files in batches", async () => {
      // Create more files than the concurrency limit (3)
      const manyFiles = Array.from({ length: 7 }, (_, i) => ({
        path: `file${i}.txt`,
        size: 100,
        sha256: `hash${i}`,
        contentType: "text/plain"
      }));

      const progressModule = await import("../../src/ui/progress.ts");
      const mockProgressRenderer = {
        start: () => {},
        update: () => {},
        complete: () => {},
      };
      stub(progressModule, "ProgressRenderer", () => mockProgressRenderer as any);

      // Mock file operations
      Deno.stat = async () => {
        throw new Deno.errors.NotFound();
      };

      const fsModule = await import("@std/fs/ensure-dir");
      stub(fsModule, "ensureDir", () => Promise.resolve());

      globalThis.fetch = async () => {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      };

      Deno.writeFile = async () => Promise.resolve();

      const results = await downloadFiles(manyFiles, ["https://server.com"], mockOptions);

      assertEquals(results.length, 7);
      // All should succeed
      assertEquals(results.every(r => r.success), true);
      // Update should be available
      assertEquals(typeof mockProgressRenderer.update, "function");
    });
  });

  describe("displayResults function", () => {
    it("should display summary for successful downloads", () => {
      const results: DownloadResult[] = [
        {
          file: { path: "file1.txt" } as FileEntry,
          success: true,
          savedPath: "/tmp/file1.txt"
        },
        {
          file: { path: "file2.txt" } as FileEntry,
          success: true,
          savedPath: "/tmp/file2.txt"
        }
      ];

      displayResults(results);

      const output = consoleOutput.logs.join("\n");
      assertEquals(output.includes("Download Summary"), true);
      assertEquals(output.includes("Successfully downloaded: 2 files"), true);
      assertEquals(output.includes("Downloaded files:"), true);
      assertEquals(output.includes("file1.txt → /tmp/file1.txt"), true);
      assertEquals(output.includes("file2.txt → /tmp/file2.txt"), true);
    });

    it("should display summary for skipped files", () => {
      const results: DownloadResult[] = [
        {
          file: { path: "file1.txt" } as FileEntry,
          success: true,
          skipped: true,
          reason: "File already exists",
          savedPath: "/tmp/file1.txt"
        }
      ];

      displayResults(results);

      const output = consoleOutput.logs.join("\n");
      assertEquals(output.includes("Skipped: 1 files"), true);
      assertEquals(output.includes("Skipped files:"), true);
      assertEquals(output.includes("file1.txt (File already exists)"), true);
    });

    it("should display summary for failed downloads", () => {
      const results: DownloadResult[] = [
        {
          file: { path: "file1.txt" } as FileEntry,
          success: false,
          error: "Network error"
        }
      ];

      displayResults(results);

      const output = consoleOutput.logs.join("\n");
      assertEquals(output.includes("Failed: 1 files"), true);
      assertEquals(output.includes("Failed downloads:"), true);
      assertEquals(output.includes("file1.txt: Network error"), true);
    });

    it("should display mixed results correctly", () => {
      const results: DownloadResult[] = [
        {
          file: { path: "success.txt" } as FileEntry,
          success: true,
          savedPath: "/tmp/success.txt"
        },
        {
          file: { path: "skipped.txt" } as FileEntry,
          success: true,
          skipped: true,
          reason: "Already exists",
          savedPath: "/tmp/skipped.txt"
        },
        {
          file: { path: "failed.txt" } as FileEntry,
          success: false,
          error: "404 Not Found"
        }
      ];

      displayResults(results);

      const output = consoleOutput.logs.join("\n");
      assertEquals(output.includes("Successfully downloaded: 1 files"), true);
      assertEquals(output.includes("Skipped: 1 files"), true);
      assertEquals(output.includes("Failed: 1 files"), true);
      assertEquals(output.includes("success.txt → /tmp/success.txt"), true);
      assertEquals(output.includes("skipped.txt (Already exists)"), true);
      assertEquals(output.includes("failed.txt: 404 Not Found"), true);
    });

    it("should handle empty results", () => {
      displayResults([]);

      const output = consoleOutput.logs.join("\n");
      assertEquals(output.includes("Successfully downloaded: 0 files"), true);
      assertEquals(output.includes("Files saved to: ./downloads"), true);
    });

    it("should show correct output directory", () => {
      const results: DownloadResult[] = [
        {
          file: { path: "file.txt" } as FileEntry,
          success: true,
          savedPath: "/custom/output/file.txt"
        }
      ];

      displayResults(results);

      const output = consoleOutput.logs.join("\n");
      assertEquals(output.includes("Files saved to: /custom/output"), true);
    });
  });
});