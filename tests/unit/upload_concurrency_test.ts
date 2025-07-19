import { assertEquals, assert } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { stub, type Stub } from "jsr:@std/testing/mock";
import { processUploads } from "../../src/lib/upload.ts";
import type { FileEntry } from "../../src/lib/nostr.ts";
import type { Signer, UploadProgress } from "../../src/lib/upload.ts";

// Mock signer for tests
class MockSigner implements Signer {
  async signEvent(event: any) {
    return {
      ...event,
      id: "mock-id",
      pubkey: "mock-pubkey",
      sig: "mock-signature",
    };
  }

  getPublicKey(): string | Promise<string> {
    return "mock-pubkey";
  }
}

describe("Upload Concurrency Tests", { sanitizeResources: false, sanitizeOps: false }, () => {
  let fetchStub: Stub<typeof globalThis, Parameters<typeof fetch>, ReturnType<typeof fetch>>;
  let uploadStartTimes: Map<string, number>;
  let uploadEndTimes: Map<string, number>;
  let concurrentUploads: number[] = [];
  let maxConcurrentUploads = 0;
  let currentlyUploading = 0;
  let originalWebSocket: typeof WebSocket;
  let uploadedFiles: Set<string>;

  // Create test files
  const createTestFiles = (count: number): FileEntry[] => {
    return Array.from({ length: count }, (_, i) => ({
      path: `/file${i + 1}.txt`,
      data: new TextEncoder().encode(`content ${i + 1}`),
      sha256: `sha256-${i + 1}`,
      contentType: "text/plain",
      size: 10,
    }));
  };

  beforeEach(() => {
    uploadStartTimes = new Map();
    uploadEndTimes = new Map();
    concurrentUploads = [];
    maxConcurrentUploads = 0;
    currentlyUploading = 0;
    uploadedFiles = new Set();

    // Mock WebSocket for relay publishing
    originalWebSocket = globalThis.WebSocket;
    const activeTimers: number[] = [];
    
    globalThis.WebSocket = class MockWebSocket {
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      private timers: number[] = [];

      constructor(url: string) {
        // Simulate successful connection
        const timer = setTimeout(() => {
          if (this.onopen) {
            this.onopen(new Event('open'));
          }
        }, 10);
        this.timers.push(timer);
        activeTimers.push(timer);
      }

      send(data: string) {
        // Simulate successful event publication
        const timer = setTimeout(() => {
          if (this.onmessage) {
            const response = JSON.stringify(["OK", "event-id", true, "success"]);
            this.onmessage(new MessageEvent('message', { data: response }));
          }
        }, 10);
        this.timers.push(timer);
        activeTimers.push(timer);
      }

      close() {
        // Clear any pending timers
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers = [];
        
        if (this.onclose) {
          this.onclose(new CloseEvent('close'));
        }
      }
    } as any;
    
    // Store reference to clear timers in afterEach
    (globalThis as any).__activeWebSocketTimers = activeTimers;

    // Track which file is being uploaded based on the sequence of operations
    let lastCheckedSha: string | null = null;
    
    // Stub fetch to simulate network delay and track concurrent uploads
    let fetchCallCount = 0;
    fetchStub = stub(globalThis, "fetch", async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";
      
      fetchCallCount++;
      
      // For PUT requests to /upload endpoint, track the upload
      if (method === "PUT" && url.endsWith("/upload")) {
        // The last HEAD check tells us which file is being uploaded
        if (lastCheckedSha) {
          const fileId = lastCheckedSha;
          
          // Track upload start
          uploadStartTimes.set(fileId, Date.now());
          currentlyUploading++;
          concurrentUploads.push(currentlyUploading);
          maxConcurrentUploads = Math.max(maxConcurrentUploads, currentlyUploading);

          // Simulate upload time (100ms per file)
          await new Promise(resolve => setTimeout(resolve, 100));

          // Track upload end
          currentlyUploading--;
          uploadEndTimes.set(fileId, Date.now());
          uploadedFiles.add(lastCheckedSha);
        }

        return new Response("OK", { status: 200 });
      }

      if (method === "HEAD") {
        const match = url.match(/sha256-(\d+)/);
        if (match) {
          const sha = match[0];
          lastCheckedSha = sha;
          
          // Check if this specific file has been uploaded
          if (uploadedFiles.has(sha)) {
            return new Response("", { status: 200 }); // File exists
          }
        }
        // File doesn't exist
        return new Response("", { status: 404 });
      }

      // WebSocket requests for relays
      if (url.startsWith("wss://")) {
        throw new Error("WebSocket not supported in test");
      }

      return new Response("OK", { status: 200 });
    });
  });

  afterEach(async () => {
    // Wait for any pending timers to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    fetchStub.restore();
    
    // Clear any pending WebSocket timers
    const activeTimers = (globalThis as any).__activeWebSocketTimers;
    if (activeTimers) {
      activeTimers.forEach((timer: number) => clearTimeout(timer));
      delete (globalThis as any).__activeWebSocketTimers;
    }
    
    globalThis.WebSocket = originalWebSocket;
    
    // Clear all state
    uploadStartTimes.clear();
    uploadEndTimes.clear();
    uploadedFiles.clear();
    concurrentUploads = [];
    maxConcurrentUploads = 0;
    currentlyUploading = 0;
  });

  it("should maintain constant pool of concurrent uploads", async () => {
    const testFiles = createTestFiles(10);
    const concurrency = 3;
    const signer = new MockSigner();
    const progressUpdates: UploadProgress[] = [];

    const results = await processUploads(
      testFiles,
      "/base",
      ["https://server1.com"],
      signer,
      ["wss://relay1.com"],
      concurrency,
      (progress) => progressUpdates.push({ ...progress })
    );
    
    assertEquals(uploadStartTimes.size, testFiles.length);
    assertEquals(uploadEndTimes.size, testFiles.length);

    // Verify max concurrent uploads never exceeded the limit
    assert(
      maxConcurrentUploads <= concurrency,
      `Max concurrent uploads (${maxConcurrentUploads}) should not exceed concurrency limit (${concurrency})`
    );

    // Verify that we actually reached the concurrency limit (for enough files)
    assertEquals(
      maxConcurrentUploads,
      concurrency,
      `Should have reached max concurrency of ${concurrency}`
    );

    // Verify uploads overlapped (constant pool behavior)
    // Check that we maintained a constant pool by looking at concurrent upload counts
    // With a constant pool, we should see the concurrency limit reached multiple times
    const concurrencyCounts = concurrentUploads.filter(count => count === concurrency);
    assert(
      concurrencyCounts.length >= 2,
      `Should have maintained max concurrency (${concurrency}) multiple times, but only saw it ${concurrencyCounts.length} times`
    );
    
    // Also verify that uploads were distributed over time (not all at once)
    const uniqueStartTimes = new Set(uploadStartTimes.values()).size;
    assert(
      uniqueStartTimes > 1,
      "Uploads should start at different times (constant pool behavior)"
    );
  });

  it("should handle different concurrency levels correctly", async () => {
    const testFiles = createTestFiles(6);
    const signer = new MockSigner();

    // Test with concurrency = 1 (sequential)
    await processUploads(
      testFiles,
      "/base",
      ["https://server1.com"],
      signer,
      ["wss://relay1.com"],
      1
    );
    assertEquals(maxConcurrentUploads, 1, "Concurrency=1 should process sequentially");

    // Reset counters
    maxConcurrentUploads = 0;
    currentlyUploading = 0;
    uploadStartTimes.clear();
    uploadEndTimes.clear();
    uploadedFiles.clear();

    // Test with concurrency = 6 (all parallel)
    await processUploads(
      testFiles,
      "/base",
      ["https://server1.com"],
      signer,
      ["wss://relay1.com"],
      6
    );
    assertEquals(maxConcurrentUploads, 6, "Concurrency=6 should process all files in parallel");
  });

  it("should update progress correctly with constant pool", async () => {
    const testFiles = createTestFiles(8);
    const concurrency = 2;
    const signer = new MockSigner();
    const progressUpdates: UploadProgress[] = [];

    await processUploads(
      testFiles,
      "/base",
      ["https://server1.com"],
      signer,
      ["wss://relay1.com"],
      concurrency,
      (progress) => progressUpdates.push({ ...progress })
    );

    // Verify progress updates
    assert(progressUpdates.length > 0, "Should have progress updates");
    
    // Check final progress state
    const finalProgress = progressUpdates[progressUpdates.length - 1];
    assertEquals(finalProgress.completed, testFiles.length);
    assertEquals(finalProgress.failed, 0);
    assertEquals(finalProgress.inProgress, 0);
    assertEquals(finalProgress.total, testFiles.length);

    // Verify inProgress values during processing
    const maxInProgress = Math.max(...progressUpdates.map(p => p.inProgress));
    assert(
      maxInProgress <= concurrency,
      `Max in-progress (${maxInProgress}) should not exceed concurrency (${concurrency})`
    );
  });

  it("should preserve original file order in results", async () => {
    const testFiles = createTestFiles(5);
    const concurrency = 3;
    const signer = new MockSigner();

    const results = await processUploads(
      testFiles,
      "/base",
      ["https://server1.com"],
      signer,
      ["wss://relay1.com"],
      concurrency
    );

    // Verify results are in the same order as input files
    assertEquals(results.length, testFiles.length);
    for (let i = 0; i < testFiles.length; i++) {
      assertEquals(results[i].file.path, testFiles[i].path);
      assertEquals(results[i].file.sha256, testFiles[i].sha256);
    }
  });
});