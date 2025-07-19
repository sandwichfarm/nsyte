import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { createReleaseArtifactSetEvent } from "../src/lib/nostr.ts";
import { SimpleSigner } from "applesauce-signers/signers";

Deno.test("NIP-51 release artifact set - appending artifacts", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  // Simulate existing release with 2 artifacts
  const existingEventIds = ["existing-file-1", "existing-file-2"];

  // Add new artifacts
  const newEventIds = ["new-file-3", "new-file-4"];

  // Combine for the updated release
  const allEventIds = [...existingEventIds, ...newEventIds];

  const event = await createReleaseArtifactSetEvent(
    signer,
    "my-project",
    "v1.0.0",
    allEventIds,
    "Updated release with additional artifacts",
  );

  assertEquals(event.kind, 30063);

  // Check that all event IDs are present
  const eTags = event.tags.filter((t) => t[0] === "e");
  assertEquals(eTags.length, 4);

  // Verify all IDs are included
  const eventIds = eTags.map((t) => t[1]);
  assertEquals(eventIds.includes("existing-file-1"), true);
  assertEquals(eventIds.includes("existing-file-2"), true);
  assertEquals(eventIds.includes("new-file-3"), true);
  assertEquals(eventIds.includes("new-file-4"), true);
});

Deno.test("NIP-51 release artifact set - replacing artifacts", async () => {
  const signer = SimpleSigner.fromKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  // Replace file-1-old with file-1-new, keep file-2, remove file-3
  const keptEventIds = ["file-2"];
  const newEventIds = ["file-1-new"];

  const allEventIds = [...keptEventIds, ...newEventIds];

  const event = await createReleaseArtifactSetEvent(
    signer,
    "my-project",
    "v2.0.0",
    allEventIds,
    "Release with replaced artifacts",
  );

  assertEquals(event.kind, 30063);

  // Check that only the correct event IDs are present
  const eTags = event.tags.filter((t) => t[0] === "e");
  assertEquals(eTags.length, 2);

  // Verify correct IDs
  const eventIds = eTags.map((t) => t[1]);
  assertEquals(eventIds.includes("file-2"), true);
  assertEquals(eventIds.includes("file-1-new"), true);
  assertEquals(eventIds.includes("file-1-old"), false);
  assertEquals(eventIds.includes("file-3"), false);
});
