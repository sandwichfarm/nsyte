import { assertEquals, assertExists } from "std/assert/mod.ts";
import type { Signer, UploadProgress, UploadResponse } from "../../src/lib/upload.ts";

Deno.test("upload types", async (t) => {
  await t.step("Signer interface", () => {
    // Test that Signer interface can be implemented
    const mockSigner: Signer = {
      signEvent: async (event) => {
        return {
          ...event,
          id: "mock-id",
          pubkey: "mock-pubkey",
          sig: "mock-sig",
        };
      },
      getPublicKey: () => "mock-public-key",
    };

    assertExists(mockSigner.signEvent);
    assertExists(mockSigner.getPublicKey);
    assertEquals(typeof mockSigner.signEvent, "function");
    assertEquals(typeof mockSigner.getPublicKey, "function");
  });

  await t.step("UploadProgress interface", () => {
    const progress: UploadProgress = {
      total: 10,
      completed: 5,
      failed: 1,
      inProgress: 2,
    };

    assertEquals(progress.total, 10);
    assertEquals(progress.completed, 5);
    assertEquals(progress.failed, 1);
    assertEquals(progress.inProgress, 2);
  });

  await t.step("UploadResponse type", () => {
    const response: UploadResponse = {
      file: {
        path: "/test/file.txt",
        size: 1024,
        sha256: "abc123",
        contentType: "text/plain",
      },
      success: true,
      eventId: "event-123",
      eventPublished: true,
      serverResults: {
        "https://server1.com": {
          success: true,
          alreadyExists: false,
        },
        "https://server2.com": {
          success: false,
          error: "Connection failed",
        },
      },
    };

    assertEquals(response.success, true);
    assertEquals(response.file.path, "/test/file.txt");
    assertEquals(response.eventId, "event-123");
    assertEquals(response.eventPublished, true);
    assertExists(response.serverResults);
    assertEquals(response.serverResults["https://server1.com"].success, true);
    assertEquals(response.serverResults["https://server2.com"].error, "Connection failed");
  });

  await t.step("UploadResponse with error", () => {
    const errorResponse: UploadResponse = {
      file: {
        path: "/test/failed.txt",
      },
      success: false,
      error: "Upload failed",
      serverResults: {},
    };

    assertEquals(errorResponse.success, false);
    assertEquals(errorResponse.error, "Upload failed");
    assertEquals(errorResponse.eventId, undefined);
    assertEquals(errorResponse.eventPublished, undefined);
  });

  await t.step("Signer with async getPublicKey", async () => {
    const asyncSigner: Signer = {
      signEvent: async (event) => {
        return {
          ...event,
          id: "async-id",
          pubkey: "async-pubkey",
          sig: "async-sig",
        };
      },
      getPublicKey: async () => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "async-public-key";
      },
    };

    const pubkey = await asyncSigner.getPublicKey();
    assertEquals(pubkey, "async-public-key");
  });
});
