import { assert, assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { processUploads, type Signer } from "../../src/lib/upload.ts";
import type { FileEntry, NostrEvent, NostrEventTemplate } from "../../src/lib/nostr.ts";

// Store original fetch and WebSocket for restoration
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
let originalSetTimeout: typeof globalThis.setTimeout;

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 500,
): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe({
  name: "Upload Module File Existence",
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  // Mock signer for testing
  const mockSigner: Signer = {
    signEvent(event: NostrEventTemplate): Promise<NostrEvent> {
      return Promise.resolve({
        id: "mock-event-id",
        pubkey: "mock-pubkey",
        created_at: event.created_at,
        kind: event.kind,
        tags: event.tags,
        content: event.content,
        sig: "mock-signature",
      });
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
    globalThis.fetch = (
      url: string | URL | Request,
      options?: RequestInit,
    ): Promise<Response> => {
      const urlStr = url.toString();
      const method = options?.method || "GET";

      if (urlStr.includes("/upload") && (method === "PUT" || method === "POST")) {
        // Extract hash from auth or just mark all known hashes as stored
        // The upload puts the file on the server; mark test file hash as stored
        storedBlobs.add("abcdef1234567890");
        return Promise.resolve(new Response("", { status: 200 }));
      } else if (method === "HEAD") {
        // Check if the blob hash is in our store
        for (const hash of storedBlobs) {
          if (urlStr.includes(hash)) {
            return Promise.resolve(new Response("", { status: 200 }));
          }
        }
        return Promise.resolve(new Response("", { status: 404 }));
      } else {
        return Promise.resolve(new Response("", { status: 404 }));
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

      send(_data: string): void {
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
    globalThis.fetch = (
      url: string | URL | Request,
      options?: RequestInit,
    ): Promise<Response> => {
      const urlStr = url.toString();
      const method = options?.method || "GET";

      if (urlStr.includes("existing1234567890") && method === "HEAD") {
        return Promise.resolve(new Response("", { status: 200 }));
      } else if (method === "HEAD") {
        return Promise.resolve(new Response("", { status: 404 }));
      } else {
        return Promise.resolve(new Response("", { status: 200 }));
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

  it("should let each server drain its upload queue independently", async () => {
    const fastServer = "https://fast-server.test";
    const slowServer = "https://slow-server.test";
    const relays = ["wss://test-relay.com"];
    const files: FileEntry[] = [
      {
        path: "/one.txt",
        data: new TextEncoder().encode("one"),
        sha256: "hash-one",
        contentType: "text/plain",
        size: 3,
      },
      {
        path: "/two.txt",
        data: new TextEncoder().encode("two"),
        sha256: "hash-two",
        contentType: "text/plain",
        size: 3,
      },
      {
        path: "/three.txt",
        data: new TextEncoder().encode("three"),
        sha256: "hash-three",
        contentType: "text/plain",
        size: 5,
      },
    ];
    const hashByFileName = new Map(files.map((file) => [
      file.path.split("/").pop() || file.path,
      file.sha256,
    ]));
    const storedBlobs = new Map<string, Set<string>>([
      [fastServer, new Set<string>()],
      [slowServer, new Set<string>()],
    ]);
    const slowHeadStarted = createDeferred();
    const releaseSlowHead = createDeferred();
    const fastPutOrder: string[] = [];
    let delayedSlowPreflight = false;
    let slowFirstHeadResolved = false;

    globalThis.fetch = async (
      url: string | URL | Request,
      options?: RequestInit,
    ): Promise<Response> => {
      const urlStr = url.toString();
      const method = options?.method || "GET";
      const server = urlStr.startsWith(slowServer) ? slowServer : fastServer;
      const hash = urlStr.slice(urlStr.lastIndexOf("/") + 1);
      const serverBlobs = storedBlobs.get(server);

      if (method === "HEAD") {
        if (
          server === slowServer &&
          hash === files[0].sha256 &&
          !delayedSlowPreflight &&
          !serverBlobs?.has(hash)
        ) {
          delayedSlowPreflight = true;
          slowHeadStarted.resolve();
          await releaseSlowHead.promise;
          slowFirstHeadResolved = true;
        }

        return new Response("", { status: serverBlobs?.has(hash) ? 200 : 404 });
      }

      if (urlStr.endsWith("/upload") && method === "PUT") {
        const body = options?.body;
        assert(body instanceof File, "Upload body should be a File");
        const uploadedHash = hashByFileName.get(body.name);
        assertExists(uploadedHash, `Unexpected uploaded file ${body.name}`);

        serverBlobs?.add(uploadedHash);
        if (server === fastServer) {
          fastPutOrder.push(uploadedHash);
        }

        return new Response("", { status: 200 });
      }

      return new Response("", { status: 404 });
    };

    const uploadPromise = processUploads(
      files,
      "/test",
      [fastServer, slowServer],
      mockSigner,
      relays,
      1,
    );

    await slowHeadStarted.promise;

    let regressionError: unknown;
    try {
      await waitFor(
        () => fastPutOrder.length >= 2,
        "Fast server did not advance past the first file while slow server was blocked",
      );
      assertEquals(
        slowFirstHeadResolved,
        false,
        "Fast server should start later files before the slow server releases its first file",
      );
    } catch (error) {
      regressionError = error;
    } finally {
      releaseSlowHead.resolve();
    }

    const results = await uploadPromise;
    if (regressionError) {
      throw regressionError;
    }

    assertEquals(
      fastPutOrder,
      files.map((file) => file.sha256),
      "Fast server should drain its full queue in file order",
    );
    assertEquals(results.length, files.length);
    assertEquals(results.every((result) => result.success), true);
    for (const result of results) {
      assertEquals(result.serverResults[fastServer].success, true);
      assertEquals(result.serverResults[slowServer].success, true);
    }
  });
});
