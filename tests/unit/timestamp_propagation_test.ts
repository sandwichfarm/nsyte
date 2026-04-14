import { assertEquals } from "@std/assert";
import { beforeAll, describe, it } from "@std/testing/bdd";
import { SimpleSigner } from "applesauce-signers";
import { encodeHex } from "@std/encoding/hex";
import {
  createAppHandlerEvent,
  createAppRecommendationEvent,
  createProfileEvent,
  createRelayListEvent,
  createServerListEvent,
  createSiteManifestEvent,
} from "../../src/lib/nostr.ts";
import {
  createSiteManifestTemplate,
  createSnapshotTemplate,
  NSITE_ROOT_SITE_KIND,
  NSITE_SNAPSHOT_KIND,
} from "../../src/lib/manifest.ts";

const CUSTOM_TS = 1700000000;

let signer: SimpleSigner;
let pubkey: string;

beforeAll(async () => {
  const privKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(privKeyBytes);
  signer = new SimpleSigner(encodeHex(privKeyBytes));
  pubkey = await signer.getPublicKey();
});

function createManifest(overrides: Partial<{
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
}> = {}) {
  return {
    id: overrides.id ?? "manifest-id",
    kind: overrides.kind ?? 15128,
    pubkey: overrides.pubkey ?? "f".repeat(64),
    created_at: overrides.created_at ?? 123,
    content: "",
    sig: "sig",
    tags: overrides.tags ?? [["path", "/index.html", "a".repeat(64)]],
  };
}

describe("timestamp propagation", () => {
  it(
    "createSiteManifestEvent (root, kind 15128) uses custom createdAt",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const event = await createSiteManifestEvent(signer, pubkey, [], undefined, undefined, CUSTOM_TS);
      assertEquals(event.created_at, CUSTOM_TS);
      assertEquals(event.kind, 15128);
    },
  );

  it(
    "createSiteManifestEvent (named, kind 35128) uses custom createdAt",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const event = await createSiteManifestEvent(
        signer,
        pubkey,
        [],
        "test-site",
        undefined,
        CUSTOM_TS,
      );
      assertEquals(event.created_at, CUSTOM_TS);
      assertEquals(event.kind, 35128);
    },
  );

  it(
    "createProfileEvent (kind 0) uses custom createdAt",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const event = await createProfileEvent(signer, { name: "test" }, CUSTOM_TS);
      assertEquals(event.created_at, CUSTOM_TS);
      assertEquals(event.kind, 0);
    },
  );

  it(
    "createRelayListEvent (kind 10002) uses custom createdAt",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const event = await createRelayListEvent(signer, [], CUSTOM_TS);
      assertEquals(event.created_at, CUSTOM_TS);
      assertEquals(event.kind, 10002);
    },
  );

  it(
    "createServerListEvent (kind 10063) uses custom createdAt",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const event = await createServerListEvent(signer, [], CUSTOM_TS);
      assertEquals(event.created_at, CUSTOM_TS);
      assertEquals(event.kind, 10063);
    },
  );

  it(
    "createAppHandlerEvent (kind 31990) uses custom createdAt",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const event = await createAppHandlerEvent(
        signer,
        [1],
        { web: { url: "https://example.com" } },
        undefined,
        undefined,
        CUSTOM_TS,
      );
      assertEquals(event.created_at, CUSTOM_TS);
      assertEquals(event.kind, 31990);
    },
  );

  it(
    "createAppRecommendationEvent (kind 31989) uses custom createdAt",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const event = await createAppRecommendationEvent(
        signer,
        1,
        { pubkey, identifier: "default" },
        CUSTOM_TS,
      );
      assertEquals(event.created_at, CUSTOM_TS);
      assertEquals(event.kind, 31989);
    },
  );

  it(
    "createSnapshotTemplate (kind 5128) uses custom createdAt",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const manifest = createManifest({ kind: NSITE_ROOT_SITE_KIND });
      const template = await createSnapshotTemplate(manifest, CUSTOM_TS);
      assertEquals(template.created_at, CUSTOM_TS);
      assertEquals(template.kind, NSITE_SNAPSHOT_KIND);
    },
  );

  it(
    "createSiteManifestTemplate uses custom createdAt",
    () => {
      const template = createSiteManifestTemplate([], undefined, undefined, CUSTOM_TS);
      assertEquals(template.created_at, CUSTOM_TS);
    },
  );
});

describe("default timestamp (no createdAt)", () => {
  it(
    "createSiteManifestTemplate without createdAt uses current time",
    () => {
      const now = Math.floor(Date.now() / 1000);
      const template = createSiteManifestTemplate([], undefined, undefined, undefined);
      assertEquals(Math.abs(template.created_at - now) <= 5, true);
    },
  );

  it(
    "createProfileEvent without createdAt uses current time",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const now = Math.floor(Date.now() / 1000);
      const event = await createProfileEvent(signer, { name: "test" });
      assertEquals(Math.abs(event.created_at - now) <= 5, true);
    },
  );
});
