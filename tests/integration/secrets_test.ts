import { assertEquals, assertNotEquals } from "std/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "std/testing/bdd.ts";
import * as nostrTools from "npm:nostr-tools";
import * as path from "std/path/mod.ts";
import { SecretsManager } from "../../src/lib/secrets/mod.ts";
import { 
  getBunkerInfo, 
  saveBunkerInfo, 
  storeBunkerUrl,
  BunkerInfo,
  encodeBunkerInfo,
  decodeBunkerInfo,
  parseBunkerUrl
} from "../../src/lib/nip46.ts";

describe("Secrets and NIP-46 Integration", () => {
  const testDir = path.join(Deno.cwd(), ".test_secrets");
  const testBunkerPubkey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const testBunkerUrl = `bunker://${testBunkerPubkey}?relay=wss://test.relay&relay=wss://another.relay`;
  let originalHomeDir: string | undefined;
  let secretsManager: SecretsManager;

  beforeEach(() => {
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
    
    secretsManager.getAllPubkeys().forEach(pubkey => {
      secretsManager.deleteNbunk(pubkey);
    });
  });

  afterEach(() => {
    secretsManager.getAllPubkeys().forEach(pubkey => {
      secretsManager.deleteNbunk(pubkey);
    });
    
    if (originalHomeDir) {
      Deno.env.set("HOME", originalHomeDir);
    } else {
      Deno.env.delete("HOME");
    }
    
    (SecretsManager as any).instance = null;
  });

  it("should properly encode, store, and retrieve bunker information", () => {
    const bunkerInfo: BunkerInfo = {
      pubkey: testBunkerPubkey,
      relays: ["wss://test.relay", "wss://another.relay"],
      local_key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      secret: "test_secret"
    };
    
    const encoded = encodeBunkerInfo(bunkerInfo);
    
    assertEquals(encoded.startsWith("nbunksec"), true);
    
    secretsManager.storeNbunk(testBunkerPubkey, encoded);
    
    const retrieved = getBunkerInfo(testBunkerPubkey);
    
    assertNotEquals(retrieved, null);
    assertEquals(retrieved?.bunkerUrl.startsWith(`bunker://${testBunkerPubkey}`), true);
    assertEquals(retrieved?.bunkerUrl.includes("relay="), true);
    assertEquals(retrieved?.clientKey.length, 32);
  });

  it("should properly handle bunker URL storage and retrieval", () => {
    storeBunkerUrl(testBunkerPubkey, testBunkerUrl);
    
    const pubkeys = secretsManager.getAllPubkeys();
    
    assertEquals(pubkeys.includes(testBunkerPubkey), true);
    
    const nbunk = secretsManager.getNbunk(testBunkerPubkey);
    assertNotEquals(nbunk, null);
    
    const decoded = decodeBunkerInfo(nbunk!);
    
    assertEquals(decoded.pubkey, testBunkerPubkey);
    assertEquals(decoded.relays.length, 2);
    assertEquals(decoded.relays.includes("wss://test.relay"), true);
    assertEquals(decoded.relays.includes("wss://another.relay"), true);
  });
}); 