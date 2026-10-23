import { assert, assertEquals, assertRejects } from "@std/assert";
import { EventStore } from "applesauce-core";
import { type Filter, getSeenRelays, type NostrEvent } from "applesauce-core/helpers";
import type { SyncLoaderRelay, SyncLoaderStatus } from "applesauce-loaders/loaders";
import { defer, from, throwError } from "rxjs";
import { createEventSync } from "../../src/lib/event-sync.ts";

const pubkey = "a".repeat(64);
const filter: Filter = { kinds: [35128], authors: [pubkey] };

function event(index: number): NostrEvent {
  return {
    id: index.toString(16).padStart(64, "0"),
    pubkey,
    kind: 35128,
    created_at: index,
    content: "",
    tags: [["d", `site-${index}`]],
    sig: "0".repeat(128),
  };
}

function testStore() {
  // Synthetic fixtures exercise transfer behavior, independently of signature verification.
  return new EventStore({ verifyEvent: undefined });
}

function testRelay(events: NostrEvent[], supportsSync = true, brokenSync = false) {
  let syncCalls = 0;
  let requestCalls = 0;
  const relay: SyncLoaderRelay = {
    getSupported: () => Promise.resolve(supportsSync ? [77] : []),
    getLimitations: () => Promise.resolve({ max_limit: 100 }),
    sync: (input, _filter, direction) =>
      defer(() => {
        syncCalls++;
        // The loader must use the relay's default receive-only direction.
        assertEquals(direction, undefined);
        if (brokenSync) return throwError(() => new Error("NEG-ERR: unsupported"));
        const store = input as EventStore;
        return from(
          events.filter((event) => !store.getEvent(event.id)).map((event) => ({
            type: "received" as const,
            from: "wss://sync.example/",
            event,
          })),
        );
      }),
    request: (filters) =>
      defer(() => {
        requestCalls++;
        const page = Array.isArray(filters) ? filters[0] : filters;
        return from(
          events.filter((event) =>
            (page.until === undefined || event.created_at <= page.until) &&
            (page.since === undefined || event.created_at >= page.since)
          ).sort((a, b) => b.created_at - a.created_at).slice(0, Math.min(page.limit ?? 100, 100)),
        );
      }),
  };
  return { relay, calls: () => ({ syncCalls, requestCalls }) };
}

Deno.test("event sync uses NIP-77 and includes cached events on repeated runs", async () => {
  const events = Array.from({ length: 1200 }, (_, index) => event(index + 1));
  const store = testStore();
  store.add(events[0]);
  store.add({ ...event(99999), kind: 1 });
  const remote = testRelay(events);
  const sync = createEventSync(store, { relay: () => remote.relay });
  const progress: SyncLoaderStatus[] = [];

  const first = await sync(["wss://sync.example"], filter, (status) => progress.push(status));
  assertEquals(first.length, 1200);
  assertEquals([...getSeenRelays(first[0]) ?? []], ["wss://sync.example/"]);
  assertEquals(store.getTimeline(filter).length, 1200);
  assertEquals(progress.at(-1)?.done, true);
  assertEquals(remote.calls(), { syncCalls: 1, requestCalls: 0 });
  assertEquals(await sync(["wss://sync.example"], filter), first);
  assertEquals(remote.calls(), { syncCalls: 2, requestCalls: 0 });
});

for (const brokenSync of [false, true]) {
  Deno.test(`event sync paginates beyond relay caps (broken NIP-77: ${brokenSync})`, async () => {
    const events = Array.from({ length: 1205 }, (_, index) => event(index + 1));
    const remote = testRelay(events, brokenSync, brokenSync);
    const sync = createEventSync(testStore(), { relay: () => remote.relay });
    const result = await sync(["wss://sync.example"], filter);
    assertEquals(result.length, 1205);
    assertEquals(new Set(result.map((event) => event.id)).size, 1205);
    assert(remote.calls().requestCalls > 12);
    assertEquals(remote.calls().syncCalls, brokenSync ? 1 : 0);
  });
}

Deno.test("event sync keeps healthy relay results when another relay fails", async () => {
  const healthy = testRelay([event(1), event(2)]);
  const failed: SyncLoaderRelay = {
    ...healthy.relay,
    request: () => throwError(() => new Error("offline")),
    sync: () => throwError(() => new Error("offline")),
  };
  const sync = createEventSync(testStore(), {
    relay: (url) => url.includes("offline") ? failed : healthy.relay,
  });
  assertEquals((await sync(["wss://offline.example", "wss://sync.example"], filter)).length, 2);
});

Deno.test("event sync reports all-relay failure even with cached events", async () => {
  const store = testStore();
  store.add(event(1));
  const remote = testRelay([]);
  const sync = createEventSync(store, {
    relay: () => ({
      ...remote.relay,
      sync: () => throwError(() => new Error("offline")),
      request: () => throwError(() => new Error("offline")),
    }),
  });
  await assertRejects(() => sync(["wss://offline.example"], filter), Error, "Unable to sync");
});

Deno.test("event sync handles no relays and empty successful syncs", async () => {
  const remote = testRelay([]);
  const sync = createEventSync(testStore(), { relay: () => remote.relay });
  assertEquals(await sync([], filter), []);
  assertEquals(remote.calls().syncCalls, 0);
  assertEquals(await sync(["wss://sync.example"], filter), []);
});
