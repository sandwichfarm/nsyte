import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import { NEVER } from "rxjs";
import { fetchUserRelayList, getUserBlossomServers, pool } from "../../src/lib/nostr.ts";

// Valid 64-char hex pubkey for testing (castUser validates format)
const TEST_PUBKEY = "0".repeat(64);

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

Deno.test({
  name: "Nostr request helpers return within timeout even without EOSE",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const requestStub = stub(pool, "request", () => NEVER as any);

    try {
      await t.step("fetchUserRelayList resolves to null", async () => {
        const result = await withTimeout(
          fetchUserRelayList(["wss://example.invalid"], TEST_PUBKEY, 10),
          2000,
        );
        assertEquals(result, null);
      });

      await t.step("getUserBlossomServers resolves to undefined", async () => {
        const result = await withTimeout(getUserBlossomServers(TEST_PUBKEY, 10), 500);
        assertEquals(result, undefined);
      });
    } finally {
      requestStub.restore();
    }
  },
});
