import { assertEquals } from "std/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { processUploads, Signer, UploadResponse, UploadProgress } from "../../src/lib/upload.ts";
import { FileEntry, NostrEvent, NostrEventTemplate } from "../../src/lib/nostr.ts";

// Mock signer for testing
class MockSigner implements Signer {
  callCount = 0;
  
  async signEvent(event: NostrEventTemplate): Promise<NostrEvent> {
    this.callCount++;
    
    return {
      ...event,
      id: `mock-id-${this.callCount}`,
      pubkey: "mock-pubkey",
      sig: "mock-signature",
    };
  }
  
  // Implement getPublicKey for Signer interface
  getPublicKey(): string {
    return "mock-pubkey";
  }
}

describe("Upload Module", () => {
  // Test data
  const testFiles: FileEntry[] = [
    {
      path: "/file1.txt",
      data: new TextEncoder().encode("file1 content"),
      sha256: "sha256-1",
      contentType: "text/plain",
      size: 13,
    },
    {
      path: "/file2.txt",
      data: new TextEncoder().encode("file2 content"),
      sha256: "sha256-2",
      contentType: "text/plain",
      size: 13,
    },
    {
      path: "/file3.txt",
      data: new TextEncoder().encode("file3 content"),
      sha256: "sha256-3",
      contentType: "text/plain",
      size: 13,
    },
    {
      path: "/file4.txt",
      data: new TextEncoder().encode("file4 content"),
      sha256: "sha256-4",
      contentType: "text/plain",
      size: 13,
    },
  ];
  
  // Mock servers
  const servers = ["https://mock-server-1", "https://mock-server-2"];
  // Mock relays for publishing events
  const relays = ["wss://relay.test"];
  
  // Mock of the fetch function for testing
  const originalFetch = globalThis.fetch;
  let fetchMock: {
    calls: { url: string; options?: RequestInit }[];
    mockImplementation: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
  };
  
  beforeEach(() => {
    // Reset the fetch mock
    fetchMock = {
      calls: [],
      mockImplementation: (input: URL | RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method || "GET";
        fetchMock.calls.push({ url, options: init });
        
        if (method === "HEAD") {
          // Simulate not-found so upload proceeds
          return Promise.resolve(new Response("", { status: 404 }));
        }
        // Simulate successful upload / PUT / POST
        return Promise.resolve(new Response("OK", { status: 200 }));
      },
    };
    
    // Replace global fetch with mock
    globalThis.fetch = fetchMock.mockImplementation;
  });
  
  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });
  
  it("should process uploads in parallel", async () => {
    const signer = new MockSigner();
    const concurrency = 2; // Process 2 files at a time
    
    // Track progress updates
    const progressUpdates: UploadProgress[] = [];
    
    // Process uploads
    const results = await processUploads(
      testFiles,
      "/base/dir",
      servers,
      signer,
      relays,
      concurrency,
      (progress: UploadProgress) => progressUpdates.push({ ...progress })
    );
    
    // Verify all files were processed
    assertEquals(results.length, testFiles.length);
    
    // Verify all uploads were successful
    for (const result of results) {
      assertEquals(result.success, true);
    }
    
    // Verify fetch was called at least once per file/server pair (HEAD and upload can vary)
    const minimumCalls = testFiles.length * servers.length;
    assertEquals(fetchMock.calls.length >= minimumCalls, true);
    
    // Verify sign event was called at least once per file (auth or event)
    assertEquals(signer.callCount >= testFiles.length, true);
    
    // Verify progress was tracked correctly
    assertEquals(progressUpdates.length > 0, true);
    assertEquals(progressUpdates[progressUpdates.length - 1].completed, testFiles.length);
    assertEquals(progressUpdates[progressUpdates.length - 1].failed, 0);
  });
  
  it("should handle errors and retry uploads", async () => {
    const signer = new MockSigner();
    
    // Make the first fetch attempt fail but the retry succeed
    let failedOnce = false;
    fetchMock.mockImplementation = (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchMock.calls.push({ url, options: init });
      
      if (url.includes("sha256-1") && !failedOnce) {
        failedOnce = true;
        return Promise.reject(new Error("Simulated fetch error"));
      }
      
      return Promise.resolve(new Response("OK", { status: 200 }));
    };
    
    // Replace global fetch with mock
    globalThis.fetch = fetchMock.mockImplementation;
    
    // Process uploads
    const results = await processUploads(
      testFiles.slice(0, 1), // Just use the first file
      "/base/dir",
      servers,
      signer,
      relays,
      1
    );
    
    // Verify the upload was successful after retry
    assertEquals(results.length, 1);
    assertEquals(results[0].success, true);
    
    // Verify fetch was called more than once for the file (initial + retry)
    assertEquals(fetchMock.calls.length > 2, true);
  });
}); 