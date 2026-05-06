import { assertEquals } from "@std/assert";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers";
import type { ISigner } from "applesauce-signers";
import { createAppHandlerEvent } from "../../src/lib/nostr.ts";

const signer = {
  getPublicKey(): Promise<string> {
    return Promise.resolve("0".repeat(64));
  },
  signEvent(template: EventTemplate): Promise<NostrEvent> {
    return Promise.resolve({
      ...template,
      id: "1".repeat(64),
      pubkey: "0".repeat(64),
      sig: "2".repeat(128),
    } as NostrEvent);
  },
} as ISigner;

Deno.test("createAppHandlerEvent omits web tags when no web patterns are configured", async () => {
  const event = await createAppHandlerEvent(
    signer,
    [1, 30023],
    {},
    undefined,
    "my-handler",
  );

  assertEquals(event.tags.filter((tag) => tag[0] === "web"), []);
});

Deno.test("createAppHandlerEvent emits configured web pattern tags", async () => {
  const event = await createAppHandlerEvent(
    signer,
    [1, 30023],
    {
      web: {
        patterns: [
          { url: "https://example.com/e/<bech32>", entities: ["nevent"] },
          { url: "https://example.com/view/<bech32>" },
        ],
      },
    },
    undefined,
    "my-handler",
  );

  assertEquals(event.tags.filter((tag) => tag[0] === "web"), [
    ["web", "https://example.com/e/<bech32>", "nevent"],
    ["web", "https://example.com/view/<bech32>"],
  ]);
});
