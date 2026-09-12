import { assertEquals } from "@std/assert";
import type { NostrEvent } from "applesauce-core/helpers";
import { SimpleSigner } from "applesauce-signers";
import { createDeleteEvent, createDeleteEventTemplate } from "../../src/lib/nostr.ts";

for (const [kind, identifier] of [[15128, ""], [35128, "blog"]] as const) {
  Deno.test(`deletion includes event ID and address for kind ${kind}`, async () => {
    const signer = new SimpleSigner(new Uint8Array(32).fill(1));
    const manifest: NostrEvent = await signer.signEvent({
      kind,
      created_at: 100,
      content: "",
      tags: identifier ? [["d", identifier]] : [],
    });
    const template = await createDeleteEventTemplate([manifest], 123);
    const signed = await createDeleteEvent(signer, [manifest]);
    assertEquals(template.created_at, 123);
    for (const event of [template, signed]) {
      assertEquals(event.kind, 5);
      assertEquals(event.tags.filter((tag) => tag[0] === "e").map((tag) => tag[1]), [manifest.id]);
      assertEquals(event.tags.filter((tag) => tag[0] === "a").map((tag) => tag[1]), [
        `${kind}:${manifest.pubkey}:${identifier}`,
      ]);
      assertEquals(event.tags.filter((tag) => tag[0] === "k").map((tag) => tag[1]), [String(kind)]);
    }
  });
}

Deno.test("ID-only deletion remains supported without inventing an address", async () => {
  const id = "a".repeat(64);
  const event = await createDeleteEventTemplate([id]);
  assertEquals(event.tags.filter((tag) => tag[0] === "e").map((tag) => tag[1]), [id]);
  assertEquals(event.tags.filter((tag) => tag[0] === "a"), []);
});
