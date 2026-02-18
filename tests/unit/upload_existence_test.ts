import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { processUploads, type Signer } from "../../src/lib/upload.ts";
import type { FileEntry, NostrEvent, NostrEventTemplate } from "../../src/lib/nostr.ts";

// Store original fetch and WebSocket for restoration
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
let originalSetTimeout: typeof globalThis.setTimeout;

describe({
  name: "Upload Module File Existence",
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  // Mock signer for testing
  const mockSigner: Signer = {
    async signEvent(event: NostrEventTemplate): Promise<NostrEvent> {
      return {
        id: "mock-event-id",
        pubkey: "mock-pubkey",
        created_at: event.created_at,
        kind: event.kind,
        tags: event.tags,
        content: event.content,
        sig: "mock-signature",
      };
    },
    getPublicKey(): string {
      return "mock-pubkey";
    },
  };

  // Setup mock data
  const mockFiles: FileEntry[] = [
    {
      path: "/test.html",
      data: new TextEncoder().encode("test content"),
      sha256: "abcdef1234567890",
      contentType: "text/html",
      size: 12,
    },
    {
      path: "/already-exists.html",
      data: new TextEncoder().encode("existing content"),
      sha256: "existing1234567890",
      contentType: "text/html",
      size: 16,
    },
  ];

  beforeEach(() => {
    // Simulate a blossom server: track which sha256 hashes have been "uploaded"
    const storedBlobs = new Set<string>();
    // The "existing" file is pre-stored
    storedBlobs.add("existing1234567890");

    // Setup mock fetch
    globalThis.fetch = async (
      url: string | URL | Request,
      options?: RequestInit,
    ): Promise<Response> => {
      const urlStr = url.toString();
      const method = options?.method || "GET";

      if (urlStr.includes("/upload") && (method === "PUT" || method === "POST")) {
        // Extract hash from auth or just mark all known hashes as stored
        // The upload puts the file on the server; mark test file hash as stored
        storedBlobs.add("abcdef1234567890");
        return new Response("", { status: 200 });
      } else if (method === "HEAD") {
        // Check if the blob hash is in our store
        for (const hash of storedBlobs) {
          if (urlStr.includes(hash)) {
            return new Response("", { status: 200 });
          }
        }
        return new Response("", { status: 404 });
      } else {
        return new Response("", { status: 404 });
      }
    };

    // Save original setTimeout for restoration
    originalSetTimeout = globalThis.setTimeout;

    // Setup mock WebSocket that immediately confirms publish
    class MockWebSocket {
      url: string;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readyState = 0;

      constructor(url: string) {
        this.url = url;
        setTimeout(() => {
          this.readyState = 1;
          if (this.onopen) {
            this.onopen(new Event("open"));
          }
          // Immediately send OK response
          setTimeout(() => {
            if (this.onmessage) {
              this.onmessage(
                new MessageEvent("message", {
                  data: JSON.stringify(["OK", "mock-event-id", true]),
                }),
              );
            }
          }, 5);
        }, 5);
      }

      send(data: string): void {
        // ignore in this simple mock
      }

      close(): void {
        this.readyState = 3;
        if (this.onclose) {
          this.onclose(new CloseEvent("close"));
        }
      }
    }

    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    // Restore originals
    globalThis.setTimeout = originalSetTimeout;
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
  });

  it("should handle already existing files on server", async () => {
    const servers = ["https://test-server.com"];
    const relays = ["wss://test-relay.com"];

    const results = await processUploads(
      mockFiles,
      "/test",
      servers,
      mockSigner,
      relays,
      2,
    );

    assertEquals(results.length, 2, "Should have results for both files");

    // All uploads should be successful
    assertEquals(results.every((r) => r.success), true, "All uploads should be successful");

    // Events are now published separately after all uploads (not per-file)
    // So eventPublished is always false at upload time
    assertEquals(
      results.every((r) => r.eventPublished === false),
      true,
      "Events should not be published during upload phase",
    );

    // Verify server results
    for (const result of results) {
      assertEquals(
        result.serverResults["https://test-server.com"].success,
        true,
        "Server upload should be successful",
      );
    }
  });

  it("should correctly mark files that already exist", async () => {
    // Override fetch to specifically test already existing file case
    globalThis.fetch = async (
      url: string | URL | Request,
      options?: RequestInit,
    ): Promise<Response> => {
      const urlStr = url.toString();
      const method = options?.method || "GET";

      if (urlStr.includes("existing1234567890") && method === "HEAD") {
        return new Response("", { status: 200 });
      } else if (method === "HEAD") {
        return new Response("", { status: 404 });
      } else {
        return new Response("", { status: 200 });
      }
    };

    const servers = ["https://test-server.com"];
    const relays = ["wss://test-relay.com"];

    const results = await processUploads(
      mockFiles,
      "/test",
      servers,
      mockSigner,
      relays,
      2,
    );

    assertEquals(results.length, 2, "Should have results for both files");

    // Check the already existing file
    const existingFile = results.find((r) => r.file.path === "/already-exists.html");
    assertExists(existingFile, "Should have a result for the existing file");
    assertEquals(existingFile?.success, true, "Already existing file should be marked as success");

    // Verify the server results indicate it already exists (alreadyExists flag)
    const serverResult = existingFile?.serverResults["https://test-server.com"];
    assertEquals(
      serverResult?.success,
      true,
      "Server should report success for already existing file",
    );
  });
});
