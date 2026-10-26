import { assert, assertEquals } from "@std/assert";
import { EventStore } from "applesauce-core";
import type { Filter, NostrEvent } from "applesauce-core/helpers";
import { RelayPool } from "applesauce-relay/pool";
import { createEventSync } from "../../src/lib/event-sync.ts";

Deno.test("bulk sync falls back from NEG-ERR and pages a real WebSocket relay", async () => {
  const events: NostrEvent[] = Array.from({ length: 1205 }, (_, index) => ({
    id: (index + 1).toString(16).padStart(64, "0"),
    pubkey: "a".repeat(64),
    kind: 35128,
    created_at: index + 1,
    content: "",
    tags: [["d", `site-${index}`]],
    sig: "0".repeat(128),
  }));
  const sockets = new Set<WebSocket>();
  let negotiations = 0;
  let requests = 0;
  let publishes = 0;
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, (request) => {
    if (request.headers.get("upgrade") !== "websocket") {
      return Response.json({ supported_nips: [1, 77], limitation: { max_limit: 100 } });
    }
    const { socket, response } = Deno.upgradeWebSocket(request);
    sockets.add(socket);
    socket.onclose = () => sockets.delete(socket);
    socket.onmessage = (message) => {
      const frame = JSON.parse(message.data);
      if (frame[0] === "NEG-OPEN") {
        negotiations++;
        socket.send(JSON.stringify(["NEG-ERR", frame[1], "unsupported: sync unavailable"]));
      } else if (frame[0] === "REQ") {
        requests++;
        const filter = frame[2] as Filter;
        const page = events.filter((event) =>
          filter.until === undefined || event.created_at <= filter.until
        ).sort((a, b) => b.created_at - a.created_at).slice(0, Math.min(filter.limit ?? 100, 100));
        for (const event of page) socket.send(JSON.stringify(["EVENT", frame[1], event]));
        socket.send(JSON.stringify(["EOSE", frame[1]]));
      } else if (frame[0] === "EVENT") {
        publishes++;
      }
    };
    return response;
  });
  const pool = new RelayPool();
  try {
    const store = new EventStore({ verifyEvent: undefined });
    const sync = createEventSync(store, pool);
    const result = await sync([`ws://127.0.0.1:${server.addr.port}`], {
      kinds: [35128],
      authors: ["a".repeat(64)],
    });
    assertEquals(result.length, 1205);
    assertEquals(store.getTimeline({ kinds: [35128] }).length, 1205);
    assertEquals(negotiations, 1);
    assert(requests > 12);
    assertEquals(publishes, 0);
  } finally {
    pool.close();
    for (const socket of sockets) socket.close();
    await server.shutdown();
  }
});
