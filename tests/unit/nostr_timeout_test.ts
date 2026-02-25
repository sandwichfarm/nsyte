import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import { NEVER } from "rxjs";
import { fetchUserRelayList, fetchUserServers, pool } from "../../src/lib/nostr.ts";

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

Deno.test("Nostr request helpers return within timeout even without EOSE", async (t) => {
  const requestStub = stub(pool, "request", () => NEVER as any);

  try {
    await t.step("fetchUserRelayList resolves to null", async () => {
      const pubkey = crypto.randomUUID();
      const result = await withTimeout(
        fetchUserRelayList(["wss://example.invalid"], pubkey, 10),
        500,
      );
      assertEquals(result, null);
    });

    await t.step("fetchUserServers resolves to []", async () => {
      const pubkey = crypto.randomUUID();
      const result = await withTimeout(fetchUserServers(pubkey, ["wss://example.invalid"], 10), 500);
      assertEquals(result, []);
    });
  } finally {
    requestStub.restore();
  }
});
