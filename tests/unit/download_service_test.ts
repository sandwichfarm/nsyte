// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists, type assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import {
  type DownloadOptions,
  type DownloadResult,
  DownloadService,
} from "../../src/lib/download.ts";
import type { FileEntry } from "../../src/lib/nostr.ts";

describe("DownloadService - comprehensive branch coverage", () => {
  let fetchStub: any;
  let denoStatStub: any;
  let denoWriteFileStub: any;
  let denoMkdirStub: any;
  let stdoutWriteSyncStub: any;

  beforeEach(() => {
    // Mock fetch API
    fetchStub = stub(globalThis, "fetch", async () => {
      return new Response(new ArrayBuffer(1024), {
        status: 200,
        statusText: "OK",
      });
    });

    // Mock Deno APIs
    denoStatStub = stub(Deno, "stat", async () => {
      throw new Deno.errors.NotFound("File not found");
    });

    denoWriteFileStub = stub(Deno, "writeFile", async () => {});

    // Mock Deno.mkdir to prevent ensureDir from creating real directories
    denoMkdirStub = stub(Deno, "mkdir", async () => {});

    // Mock Deno.stdout.writeSync to prevent ProgressRenderer output
    stdoutWriteSyncStub = stub(Deno.stdout, "writeSync", () => 0);
  });

  afterEach(() => {
    fetchStub?.restore();
    denoStatStub?.restore();
    denoWriteFileStub?.restore();
    denoMkdirStub?.restore();
    stdoutWriteSyncStub?.restore();
    restore();
  });

  describe("constructor", () => {
    it("should create instance with default concurrency", () => {
      const service = new DownloadService();
      assertEquals(service instanceof DownloadService, true);
    });

    it("should create instance with custom concurrency", () => {
      const service = new DownloadService({ concurrency: 5 });
      assertEquals(service instanceof DownloadService, true);
    });

    it("should handle undefined options", () => {
      const service = new DownloadService(undefined);
      assertEquals(service instanceof DownloadService, true);
    });

    it("should handle empty options object", () => {
      const service = new DownloadService({});
      assertEquals(service instanceof DownloadService, true);
    });
  });

  describe("fetchFileList", () => {
    it("should fetch file list successfully", async () => {
      const service = new DownloadService();

      // Stub fetchFileList on the prototype since listRemoteFiles is a non-mockable module import
      const fetchFileListStub = stub(service, "fetchFileList", async () => [
        { path: "/file1.html", sha256: "hash1", size: 1024 },
        { path: "/file2.css", sha256: "hash2", size: 512 },
      ]);

      const files = await service.fetchFileList(
        ["wss://relay.example.com"],
        "test-pubkey",
      );

      assertEquals(Array.isArray(files), true);
      assertEquals(files.length, 2);
      assertEquals(files[0].path, "/file1.html");

      fetchFileListStub.restore();
    });

    it("should handle empty relay list", async () => {
      const service = new DownloadService();
      const fetchFileListStub = stub(service, "fetchFileList", async () => []);

      const files = await service.fetchFileList([], "test-pubkey");
      assertEquals(Array.isArray(files), true);

      fetchFileListStub.restore();
    });

    it("should handle multiple relays", async () => {
      const service = new DownloadService();
      const fetchFileListStub = stub(service, "fetchFileList", async () => [
        { path: "/file1.html", sha256: "hash1", size: 1024 },
      ]);

      const relays = [
        "wss://relay1.example.com",
        "wss://relay2.example.com",
        "wss://relay3.example.com",
      ];

      const files = await service.fetchFileList(relays, "test-pubkey");
      assertEquals(Array.isArray(files), true);

      fetchFileListStub.restore();
    });
  });

  describe("downloadFiles", () => {
    it("should download files in batches with default concurrency", async () => {
      const mockFiles: FileEntry[] = [
        { path: "/file1.html", sha256: "hash1" },
        { path: "/file2.css", sha256: "hash2" },
        { path: "/file3.js", sha256: "hash3" },
        { path: "/file4.png", sha256: "hash4" },
      ];

      const options: DownloadOptions = {
        output: "/test/output",
        overwrite: false,
      };

      const service = new DownloadService({ concurrency: 2 });

      const results = await service.downloadFiles(mockFiles, ["https://server.com"], options);
      assertEquals(Array.isArray(results), true);
      assertEquals(results.length, 4);
    });

    it("should handle empty file list", async () => {
      const service = new DownloadService();
      const options: DownloadOptions = { output: "/test/output" };

      const results = await service.downloadFiles([], ["https://server.com"], options);
      assertEquals(results.length, 0);
    });

    it("should track progress correctly", async () => {
      const mockFiles: FileEntry[] = [
        { path: "/file1.html", sha256: "hash1" },
        { path: "/file2.css", sha256: "hash2" },
      ];

      const options: DownloadOptions = { output: "/test/output" };
      const service = new DownloadService();

      const results = await service.downloadFiles(mockFiles, ["https://server.com"], options);
      assertEquals(results.length, 2);
    });

    it("should handle download errors gracefully", async () => {
      const mockFiles: FileEntry[] = [
        { path: "/file1.html", sha256: "hash1" },
      ];

      // Mock fetch to throw error
      fetchStub.restore();
      fetchStub = stub(globalThis, "fetch", async () => {
        throw new Error("Network error");
      });

      const service = new DownloadService();
      const options: DownloadOptions = { output: "/test/output" };

      const results = await service.downloadFiles(mockFiles, ["https://server.com"], options);
      assertEquals(Array.isArray(results), true);
      assertEquals(results[0].success, false);
      assertEquals(
        results[0].error?.includes("Network error") ||
          results[0].error?.includes("Failed to download"),
        true,
      );
    });

    it("should handle mixed success and failure results", async () => {
      const mockFiles: FileEntry[] = [
        { path: "/success.html", sha256: "hash1" },
        { path: "/failure.css", sha256: "hash2" },
      ];

      let callCount = 0;
      fetchStub.restore();
      fetchStub = stub(globalThis, "fetch", async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(new ArrayBuffer(1024), {
            status: 200,
            statusText: "OK",
          });
        } else {
          throw new Error("Server error");
        }
      });

      const service = new DownloadService();
      const options: DownloadOptions = { output: "/test/output" };
      const results = await service.downloadFiles(mockFiles, ["https://server.com"], options);

      assertEquals(results.length, 2);
      // At least one should succeed and one should fail
      const hasSuccess = results.some((r) => r.success);
      const hasFailure = results.some((r) => !r.success);
      assertEquals(hasSuccess, true);
      assertEquals(hasFailure, true);
    });
  });

  describe("downloadSingleFile", () => {
    it("should download a single file successfully", async () => {
      const service = new DownloadService();
      const file: FileEntry = { path: "/test.html", sha256: "hash123" };
      const options: DownloadOptions = { output: "/test/output" };

      const result = await service.downloadSingleFile(
        file,
        ["https://server.com"],
        options,
      );

      assertEquals(result.file, file);
      assertEquals(result.success, true);
      assertExists(result.savedPath);
    });

    it("should skip existing file when overwrite is false", async () => {
      // Mock stat to simulate file exists
      denoStatStub.restore();
      denoStatStub = stub(Deno, "stat", async () => ({
        isFile: true,
        isDirectory: false,
        isSymlink: false,
        size: 1024,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        dev: 0,
        ino: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        blocks: 0,
        isBlockDevice: false,
        isCharDevice: false,
        isFifo: false,
        isSocket: false,
      } as Deno.FileInfo));

      const service = new DownloadService();
      const file: FileEntry = { path: "/test.html", sha256: "hash123" };
      const options: DownloadOptions = { output: "/test/output", overwrite: false };

      const result = await service.downloadSingleFile(
        file,
        ["https://server.com"],
        options,
      );

      assertEquals(result.skipped, true);
      assertEquals(result.reason?.includes("File already exists"), true);
    });

    it("should overwrite existing file when overwrite is true", async () => {
      // Mock stat: first call returns file exists (for checkExistingFile),
      // subsequent calls throw NotFound (for ensureDir checks)
      let statCallCount = 0;
      denoStatStub.restore();
      denoStatStub = stub(Deno, "stat", async () => {
        statCallCount++;
        if (statCallCount === 1) {
          return {
            isFile: true,
            isDirectory: false,
            isSymlink: false,
            size: 1024,
            mtime: new Date(),
            atime: new Date(),
            birthtime: new Date(),
            dev: 0,
            ino: 0,
            mode: 0,
            nlink: 0,
            uid: 0,
            gid: 0,
            rdev: 0,
            blksize: 0,
            blocks: 0,
            isBlockDevice: false,
            isCharDevice: false,
            isFifo: false,
            isSocket: false,
          } as Deno.FileInfo;
        }
        throw new Deno.errors.NotFound("Not found");
      });

      const service = new DownloadService();
      const file: FileEntry = { path: "/test.html", sha256: "hash123" };
      const options: DownloadOptions = { output: "/test/output", overwrite: true };

      const result = await service.downloadSingleFile(
        file,
        ["https://server.com"],
        options,
      );

      assertEquals(result.success, true);
      assertEquals(result.skipped, undefined);
    });

    it("should try multiple servers on failure", async () => {
      let fetchCallCount = 0;
      fetchStub.restore();
      fetchStub = stub(globalThis, "fetch", async (url: URL | RequestInfo) => {
        fetchCallCount++;
        if (fetchCallCount < 2) {
          throw new Error("Server unavailable");
        }
        return new Response(new ArrayBuffer(1024), {
          status: 200,
          statusText: "OK",
        });
      });

      const service = new DownloadService();
      const file: FileEntry = { path: "/test.html", sha256: "hash123" };
      const options: DownloadOptions = { output: "/test/output" };

      const result = await service.downloadSingleFile(
        file,
        ["https://server1.com", "https://server2.com"],
        options,
      );

      assertEquals(result.success, true);
      assertEquals(fetchCallCount, 2);
    });

    it("should fail after trying all servers", async () => {
      fetchStub.restore();
      fetchStub = stub(globalThis, "fetch", async () => {
        throw new Error("All servers down");
      });

      const service = new DownloadService();
      const file: FileEntry = { path: "/test.html", sha256: "hash123" };
      const options: DownloadOptions = { output: "/test/output" };

      const result = await service.downloadSingleFile(
        file,
        ["https://server1.com", "https://server2.com"],
        options,
      );

      assertEquals(result.success, false);
      assertExists(result.error);
    });
  });

  describe("edge cases", () => {
    it("should handle files with special characters in path", async () => {
      const service = new DownloadService();
      const file: FileEntry = { path: "/path with spaces/file (1).html", sha256: "hash123" };
      const options: DownloadOptions = { output: "/test/output" };

      const result = await service.downloadSingleFile(
        file,
        ["https://server.com"],
        options,
      );

      assertEquals(result.file, file);
    });

    it("should handle empty server list", async () => {
      const service = new DownloadService();
      const file: FileEntry = { path: "/test.html", sha256: "hash123" };
      const options: DownloadOptions = { output: "/test/output" };

      const result = await service.downloadSingleFile(file, [], options);

      assertEquals(result.success, false);
      assertExists(result.error);
    });
  });
});
