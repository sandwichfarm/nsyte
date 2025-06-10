import { assertEquals, assertNotEquals } from "std/testing/asserts.ts";
import * as path from "std/path/mod.ts";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";
import {
  BunkerInfo,
  decodeBunkerInfo,
  encodeBunkerInfo,
  getBunkerInfo,
  parseBunkerUrl,
  saveBunkerInfo,
  storeBunkerUrl,
} from "../../src/lib/nip46.ts";

Deno.test("Secrets and NIP-46 Integration", async (t) => {
  const testDir = path.join(Deno.cwd(), ".test_secrets");
  const testBunkerPubkey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const testBunkerUrl =
    `bunker://${testBunkerPubkey}?relay=wss://test.relay&relay=wss://another.relay`;
  let originalHomeDir: string | undefined;
  let secretsManager: SecretsManager;

  const setupTest = async () => {
    originalHomeDir = Deno.env.get("HOME");
    Deno.env.set("HOME", testDir);

    try {
      Deno.mkdirSync(testDir, { recursive: true });
    } catch (e) {
      if (!(e instanceof Deno.errors.AlreadyExists)) {
        throw e;
      }
    }

    (SecretsManager as any).instance = null;
    secretsManager = SecretsManager.getInstance();

    const pubkeys = await secretsManager.getAllPubkeys();
    for (const pubkey of pubkeys) {
      await secretsManager.deleteNbunk(pubkey);
    }
  };

  const cleanupTest = async () => {
    const pubkeys = await secretsManager.getAllPubkeys();
    for (const pubkey of pubkeys) {
      await secretsManager.deleteNbunk(pubkey);
    }

    if (originalHomeDir) {
      Deno.env.set("HOME", originalHomeDir);
    } else {
      Deno.env.delete("HOME");
    }

    (SecretsManager as any).instance = null;
  };

  await t.step("should properly encode, store, and retrieve bunker information", async () => {
    await setupTest();
    const bunkerInfo: BunkerInfo = {
      pubkey: testBunkerPubkey,
      relays: ["wss://test.relay", "wss://another.relay"],
      local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      secret: "test_secret",
    };

    const encoded = encodeBunkerInfo(bunkerInfo);

    assertEquals(encoded.startsWith("nbunksec"), true);

    await secretsManager.storeNbunk(testBunkerPubkey, encoded);

    const retrieved = await getBunkerInfo(testBunkerPubkey);

    assertNotEquals(retrieved, null);
    assertEquals(retrieved?.bunkerUrl.startsWith(`bunker://${testBunkerPubkey}`), true);
    assertEquals(retrieved?.bunkerUrl.includes("relay="), true);
    assertEquals(retrieved?.clientKey.length, 32);
    await cleanupTest();
  });

  await t.step("should properly handle bunker URL storage and retrieval", async () => {
    await setupTest();
    await storeBunkerUrl(testBunkerPubkey, testBunkerUrl);

    const pubkeys = await secretsManager.getAllPubkeys();

    assertEquals(pubkeys.includes(testBunkerPubkey), true);

    const nbunk = await secretsManager.getNbunk(testBunkerPubkey);
    assertNotEquals(nbunk, null);

    const decoded = decodeBunkerInfo(nbunk!);

    assertEquals(decoded.pubkey, testBunkerPubkey);
    assertEquals(decoded.relays.length, 2);
    assertEquals(decoded.relays.includes("wss://test.relay"), true);
    assertEquals(decoded.relays.includes("wss://another.relay"), true);
    await cleanupTest();
  });
});
