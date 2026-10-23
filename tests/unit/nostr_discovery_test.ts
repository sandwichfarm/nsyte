import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import { PrivateKeySigner } from "applesauce-signers";
import { from, NEVER } from "rxjs";
import { fetchSiteManifestEvent, getUserOutboxes, pool, store } from "../../src/lib/nostr.ts";
import { fetchTrustedSiteManifestEvent } from "../../src/lib/site-manifest.ts";

for (const mode of ["outboxes", "manifest", "trusted manifest"]) {
  Deno.test({
    name: `${mode} discovery does not request a profile or repeat relay queries`,
    // Applesauce models retain their shared subscriptions briefly after consumers leave.
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const signer = new PrivateKeySigner();
      const pubkey = await signer.getPublicKey();
      store.add(
        await signer.signEvent({
          kind: 10002,
          created_at: 100,
          tags: [["r", "wss://outbox.example.com", "write"]],
          content: "",
        }),
      );
      const manifest = await signer.signEvent({
        kind: 15128,
        created_at: 100,
        tags: [["relay", "wss://outbox.example.com/"], ["relay", "wss://new.example.com"]],
        content: "",
      });
      const newer = await signer.signEvent({ ...manifest, created_at: 200 });
      const loader = stub(store, "eventLoader", () => NEVER);
      const requests = stub(
        pool,
        "request",
        (relays) =>
          from([
            Array.isArray(relays) && relays.includes("wss://new.example.com/") ? newer : manifest,
          ]),
      );
      try {
        if (mode === "outboxes") {
          assertEquals(await getUserOutboxes(pubkey), ["wss://outbox.example.com/"]);
          assertEquals(requests.calls.length, 0);
        } else if (mode === "manifest") {
          assertEquals(
            (await fetchSiteManifestEvent(["wss://configured.example.com"], pubkey))?.id,
            manifest.id,
          );
          assertEquals(requests.calls.map((call) => call.args[0]), [
            ["wss://configured.example.com/", "wss://outbox.example.com/"],
          ]);
        } else {
          const result = await fetchTrustedSiteManifestEvent(
            ["wss://configured.example.com"],
            pubkey,
          );
          assertEquals(result.event?.id, newer.id);
          assertEquals(requests.calls.map((call) => call.args[0]), [
            ["wss://configured.example.com/", "wss://outbox.example.com/"],
            ["wss://new.example.com/"],
          ]);
          assertEquals(result.relays, [
            "wss://configured.example.com/",
            "wss://outbox.example.com/",
            "wss://new.example.com/",
          ]);
        }
        // Any missing metadata would remain unavailable forever. Discovery must never ask for it.
        assertEquals(loader.calls.length, 0);
      } finally {
        loader.restore();
        requests.restore();
        store.remove(manifest.id);
        store.remove(newer.id);
        for (const event of store.getTimeline({ authors: [pubkey] })) store.remove(event.id);
      }
    },
  });
}
