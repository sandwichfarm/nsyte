// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "std/testing/bdd.ts";

import {
  displayResults,
  downloadFromServer,
  type DownloadResult,
} from "../../src/commands/download.ts";
import { type FileEntry } from "../../src/lib/nostr.ts";

// Test state
let consoleOutput: { logs: string[]; errors: string[] };
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalFetch: typeof globalThis.fetch;

describe("Download Functions - Simple Unit Tests", () => {
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
  });

  afterEach(() => {
    // Restore console
    console.log = originalLog;
    console.error = originalError;

    // Restore globals
    globalThis.fetch = originalFetch;
  });

  describe("downloadFromServer function", () => {
    it("should successfully download file data", async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      globalThis.fetch = async (input: string | Request | URL) => {
        assertEquals(String(input), "https://server.com/abc123");
        return new Response(testData, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
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
        "HTTP 500: Internal Server Error",
      );
    });

    it("should throw error for network failures", async () => {
      globalThis.fetch = async () => {
        throw new Error("Network connection failed");
      };

      await assertRejects(
        () => downloadFromServer("https://server.com", "network-fail"),
        Error,
        "Network connection failed",
      );
    });
  });

  describe("displayResults function", () => {
    it("should display summary for successful downloads", () => {
      const results: DownloadResult[] = [
        {
          file: { path: "file1.txt" } as FileEntry,
          success: true,
          savedPath: "/tmp/file1.txt",
        },
        {
          file: { path: "file2.txt" } as FileEntry,
          success: true,
          savedPath: "/tmp/file2.txt",
        },
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
          savedPath: "/tmp/file1.txt",
        },
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
          error: "Network error",
        },
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
          savedPath: "/tmp/success.txt",
        },
        {
          file: { path: "skipped.txt" } as FileEntry,
          success: true,
          skipped: true,
          reason: "Already exists",
          savedPath: "/tmp/skipped.txt",
        },
        {
          file: { path: "failed.txt" } as FileEntry,
          success: false,
          error: "404 Not Found",
        },
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
          savedPath: "/custom/output/file.txt",
        },
      ];

      displayResults(results);

      const output = consoleOutput.logs.join("\n");
      assertEquals(output.includes("Files saved to: /custom/output"), true);
    });
  });
});
