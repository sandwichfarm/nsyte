// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";
import { restore, stub } from "std/testing/mock.ts";

import { DownloadService } from "../../src/lib/download.ts";
import { type FileEntry } from "../../src/lib/nostr.ts";

// Test state
let consoleOutput: { logs: string[]; errors: string[] };
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalFetch: typeof globalThis.fetch;
let originalWriteFile: typeof Deno.writeFile;
let originalStat: typeof Deno.stat;

describe("DownloadService - Pure Business Logic Tests", () => {
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
  });

  describe("DownloadService.create", () => {
    it("should create service with default concurrency", () => {
      const service = DownloadService.create();
      assertExists(service);
    });

    it("should create service with custom concurrency", () => {
      const service = DownloadService.create({ concurrency: 5 });
      assertExists(service);
    });
  });

  describe("downloadFromServer", () => {
    it("should successfully download file data", async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      globalThis.fetch = async (input: string | Request | URL) => {
        assertEquals(String(input), "https://server.com/abc123");
        return new Response(testData, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        });
      };

      const service = DownloadService.create();
      const result = await service.downloadFromServer("https://server.com", "abc123");
      assertEquals(result, testData);
    });

    it("should handle server URLs with trailing slash", async () => {
      globalThis.fetch = async (input: string | Request | URL) => {
        assertEquals(String(input), "https://server.com/abc123");
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      };

      const service = DownloadService.create();
      const result = await service.downloadFromServer("https://server.com/", "abc123");
      assertExists(result);
      assertEquals(result.length, 3);
    });

    it("should return null for 404 responses", async () => {
      globalThis.fetch = async () => {
        return new Response("Not Found", { status: 404 });
      };

      const service = DownloadService.create();
      const result = await service.downloadFromServer("https://server.com", "notfound");
      assertEquals(result, null);
    });

    it("should throw error for other HTTP error responses", async () => {
      globalThis.fetch = async () => {
        return new Response("Server Error", { status: 500, statusText: "Internal Server Error" });
      };

      const service = DownloadService.create();
      await assertRejects(
        () => service.downloadFromServer("https://server.com", "error"),
        Error,
        "HTTP 500: Internal Server Error",
      );
    });

    it("should throw error for network failures", async () => {
      globalThis.fetch = async () => {
        throw new Error("Network connection failed");
      };

      const service = DownloadService.create();
      await assertRejects(
        () => service.downloadFromServer("https://server.com", "network-fail"),
        Error,
        "Network connection failed",
      );
    });
  });

  describe("calculateStats", () => {
    it("should calculate correct statistics for mixed results", () => {
      const service = DownloadService.create();

      const results = [
        {
          file: { path: "success1.txt", size: 100 } as FileEntry,
          success: true,
          savedPath: "/tmp/success1.txt",
        },
        {
          file: { path: "success2.txt", size: 200 } as FileEntry,
          success: true,
          savedPath: "/tmp/success2.txt",
        },
        {
          file: { path: "skipped.txt", size: 150 } as FileEntry,
          success: true,
          skipped: true,
          reason: "Already exists",
          savedPath: "/tmp/skipped.txt",
        },
        {
          file: { path: "failed.txt", size: 300 } as FileEntry,
          success: false,
          error: "404 Not Found",
        },
      ];

      const stats = service.calculateStats(results);

      assertEquals(stats.totalFiles, 4);
      assertEquals(stats.successful, 2);
      assertEquals(stats.skipped, 1);
      assertEquals(stats.failed, 1);
      assertEquals(stats.totalSize, 750); // 100 + 200 + 150 + 300
      assertEquals(stats.downloadedSize, 300); // Only successful downloads: 100 + 200
    });

    it("should handle empty results", () => {
      const service = DownloadService.create();
      const stats = service.calculateStats([]);

      assertEquals(stats.totalFiles, 0);
      assertEquals(stats.successful, 0);
      assertEquals(stats.skipped, 0);
      assertEquals(stats.failed, 0);
      assertEquals(stats.totalSize, 0);
      assertEquals(stats.downloadedSize, 0);
    });

    it("should handle files without size information", () => {
      const service = DownloadService.create();

      const results = [
        {
          file: { path: "no-size.txt" } as FileEntry,
          success: true,
          savedPath: "/tmp/no-size.txt",
        },
      ];

      const stats = service.calculateStats(results);

      assertEquals(stats.totalFiles, 1);
      assertEquals(stats.successful, 1);
      assertEquals(stats.totalSize, 0);
      assertEquals(stats.downloadedSize, 0);
    });
  });

  describe("validateOptions", () => {
    it("should validate correct options", () => {
      const result = DownloadService.validateOptions({
        output: "/tmp/downloads",
        overwrite: false,
        verbose: true,
      });

      assertEquals(result.valid, true);
      assertEquals(result.errors, []);
    });

    it("should reject missing output directory", () => {
      const result = DownloadService.validateOptions({
        overwrite: false,
      });

      assertEquals(result.valid, false);
      assertEquals(result.errors, ["Output directory is required"]);
    });

    it("should reject empty output directory", () => {
      const result = DownloadService.validateOptions({
        output: "",
        overwrite: false,
      });

      assertEquals(result.valid, false);
      assertEquals(result.errors, ["Output directory is required"]);
    });

    it("should reject whitespace-only output directory", () => {
      const result = DownloadService.validateOptions({
        output: "   ",
        overwrite: false,
      });

      assertEquals(result.valid, false);
      assertEquals(result.errors, ["Output directory is required"]);
    });
  });

  describe("fetchFileList", () => {
    it("should exist as a method", () => {
      const service = DownloadService.create();
      assertEquals(typeof service.fetchFileList, "function");
    });
  });

  describe("downloadSingleFile - file existence checks", () => {
    const mockFile: FileEntry = {
      path: "test/file.txt",
      size: 100,
      sha256: "abc123",
    };

    const options = {
      output: "/tmp/downloads",
      overwrite: false,
      verbose: false,
    };

    it("should skip file if it already exists and overwrite is false", async () => {
      // Mock file exists
      Deno.stat = async () => {
        return { isFile: true } as Deno.FileInfo;
      };

      const service = DownloadService.create();
      const result = await service.downloadSingleFile(mockFile, ["https://server.com"], options);

      assertEquals(result.success, true);
      assertEquals(result.skipped, true);
      assertEquals(result.reason, "File already exists (use --overwrite to replace)");
    });

    it("should return error if file has no SHA256 hash", async () => {
      const fileNoHash = { ...mockFile, sha256: undefined };

      // Mock file doesn't exist
      Deno.stat = async () => {
        throw new Deno.errors.NotFound();
      };

      const service = DownloadService.create();
      const result = await service.downloadSingleFile(fileNoHash, ["https://server.com"], options);

      assertEquals(result.success, false);
      assertEquals(result.error, "No SHA256 hash found for file");
    });

    it("should handle successful download workflow", async () => {
      const testData = new Uint8Array([1, 2, 3]);

      // Mock file doesn't exist
      Deno.stat = async () => {
        throw new Deno.errors.NotFound();
      };

      // Mock successful download
      globalThis.fetch = async () => {
        return new Response(testData, { status: 200 });
      };

      // Mock file write and directory creation globally
      Deno.writeFile = async () => Promise.resolve();

      const service = DownloadService.create();
      const result = await service.downloadSingleFile(mockFile, ["https://server.com"], options);

      assertEquals(result.success, true);
      assertEquals(result.skipped, undefined);
      assertExists(result.savedPath);
    });
  });

  describe("error handling", () => {
    it("should handle server selection correctly", async () => {
      const mockFile: FileEntry = {
        path: "test.txt",
        size: 100,
        sha256: "abc123",
      };

      const options = {
        output: "/tmp/downloads",
        overwrite: false,
        verbose: false,
      };

      // Mock file doesn't exist
      Deno.stat = async () => {
        throw new Deno.errors.NotFound();
      };

      // Mock all servers fail
      globalThis.fetch = async () => {
        return new Response("Not Found", { status: 404 });
      };

      const service = DownloadService.create();
      const servers = ["https://server1.com", "https://server2.com"];
      const result = await service.downloadSingleFile(mockFile, servers, options);

      assertEquals(result.success, false);
      assertEquals(
        result.error,
        `Failed to download from any server (tried ${servers.length} servers)`,
      );
    });
  });
});
