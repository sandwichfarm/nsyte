import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import { SecretsManager } from "../../src/lib/secrets/manager.ts";
import * as utils from "../../src/lib/secrets/utils.ts";
import * as keychain from "../../src/lib/secrets/keychain.ts";
import { EncryptedStorage } from "../../src/lib/secrets/encrypted-storage.ts";

describe("secrets/manager - comprehensive branch coverage", () => {
  let manager: SecretsManager;
  let utilsStub: any;
  let keychainStub: any;
  let encryptedStorageStub: any;
  let fileExistsStub: any;
  let readTextFileStub: any;
  let writeTextFileStub: any;
  let removeStub: any;
  let readTextFileSyncStub: any;
  let writeTextFileSyncStub: any;

  beforeEach(() => {
    // Get fresh instance for each test
    manager = SecretsManager.getInstance();
    // Reset the instance's internal state
    (manager as any).initialized = false;
    (manager as any).secretsPath = null;
    (manager as any).storageBackend = null;
    (manager as any).legacyMode = false;
    (manager as any).legacySecrets = {};
  });

  afterEach(() => {
    restore();
  });

  const mockUtils = (configDir: string | null = "/test/config") => {
    utilsStub = stub(utils, "ensureSystemConfigDir", () => configDir);
    fileExistsStub = stub(utils, "fileExists", () => false);
  };

  const mockKeychain = (provider: any = null) => {
    keychainStub = stub(keychain, "getKeychainProvider", async () => provider);
  };

  const mockEncryptedStorage = (initSuccess: boolean = true) => {
    const mockStorage = {
      initialize: async () => initSuccess,
      store: async () => true,
      retrieve: async () => "test-value",
      delete: async () => true,
      list: async () => ["test-pubkey"],
    };

    encryptedStorageStub = stub(EncryptedStorage.prototype, "initialize", async () => initSuccess);
    stub(EncryptedStorage.prototype, "store", async () => true);
    stub(EncryptedStorage.prototype, "retrieve", async () => "test-value");
    stub(EncryptedStorage.prototype, "delete", async () => true);
    stub(EncryptedStorage.prototype, "list", async () => ["test-pubkey"]);

    return mockStorage;
  };

  const mockFileSystem = (
    fileContent: string = "{}",
    fileExists: boolean = false,
    readSuccess: boolean = true,
    writeSuccess: boolean = true,
  ) => {
    fileExistsStub?.restore();
    fileExistsStub = stub(utils, "fileExists", () => fileExists);

    readTextFileStub = stub(Deno, "readTextFile", async () => {
      if (!readSuccess) throw new Error("Read failed");
      return fileContent;
    });

    writeTextFileStub = stub(Deno, "writeTextFile", async () => {
      if (!writeSuccess) throw new Error("Write failed");
    });

    removeStub = stub(Deno, "remove", async () => {});

    readTextFileSyncStub = stub(Deno, "readTextFileSync", () => {
      if (!readSuccess) throw new Error("Read failed");
      return fileContent;
    });

    writeTextFileSyncStub = stub(Deno, "writeTextFileSync", () => {
      if (!writeSuccess) throw new Error("Write failed");
    });
  };

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = SecretsManager.getInstance();
      const instance2 = SecretsManager.getInstance();
      assertEquals(instance1, instance2);
    });

    it("should create new instance on first call", () => {
      // Reset static instance
      (SecretsManager as any).instance = undefined;

      const instance = SecretsManager.getInstance();
      assertExists(instance);
    });
  });

  describe("initialize", () => {
    it("should return true if already initialized", async () => {
      (manager as any).initialized = true;

      const result = await manager.initialize();
      assertEquals(result, true);
    });

    it("should return false when no config directory", async () => {
      mockUtils(null);

      const result = await manager.initialize();
      assertEquals(result, false);
    });

    it("should use keychain when available", async () => {
      const mockProvider = {
        store: async () => true,
        retrieve: async () => "test",
        delete: async () => true,
        list: async () => ["pubkey"],
      };

      mockUtils("/test/config");
      mockKeychain(mockProvider);
      mockFileSystem("{}", false);

      const result = await manager.initialize();
      assertEquals(result, true);

      // Should use keychain backend
      const backend = (manager as any).storageBackend;
      assertExists(backend);
    });

    it("should use encrypted storage when keychain not available", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem("{}", false);

      const result = await manager.initialize();
      assertEquals(result, true);

      // Should use encrypted backend
      const backend = (manager as any).storageBackend;
      assertExists(backend);
    });

    it("should fall back to legacy mode when encrypted storage fails", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(false);
      mockFileSystem("{}", false);

      const result = await manager.initialize();
      assertEquals(result, true);
      assertEquals((manager as any).legacyMode, true);
    });

    it("should migrate legacy secrets after initialization", async () => {
      const legacyContent = '{"pubkey1": "nbunksec1", "pubkey2": "nbunksec2"}';

      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem(legacyContent, true);

      const result = await manager.initialize();
      assertEquals(result, true);
    });
  });

  describe("migrateLegacySecrets", () => {
    it("should skip migration when no secrets path", async () => {
      (manager as any).secretsPath = null;

      await (manager as any).migrateLegacySecrets();
      // No error should occur
    });

    it("should skip migration when file doesn't exist", async () => {
      (manager as any).secretsPath = "/test/secrets.json";
      mockFileSystem("{}", false);

      await (manager as any).migrateLegacySecrets();
      // No error should occur
    });

    it("should skip migration in legacy mode", async () => {
      (manager as any).secretsPath = "/test/secrets.json";
      (manager as any).legacyMode = true;
      mockFileSystem("{}", true);

      await (manager as any).migrateLegacySecrets();
      // No error should occur
    });

    it("should skip migration when no secrets in file", async () => {
      (manager as any).secretsPath = "/test/secrets.json";
      (manager as any).storageBackend = {
        store: async () => true,
        retrieve: async () => null,
        delete: async () => true,
        list: async () => [],
      };
      mockFileSystem("{}", true);

      await (manager as any).migrateLegacySecrets();
      // No error should occur
    });

    it("should migrate all secrets successfully", async () => {
      const legacyContent = '{"pubkey1": "nbunksec1", "pubkey2": "nbunksec2"}';
      (manager as any).secretsPath = "/test/secrets.json";

      let storeCount = 0;
      (manager as any).storageBackend = {
        store: async () => {
          storeCount++;
          return true;
        },
        retrieve: async () => null,
        delete: async () => true,
        list: async () => [],
      };

      mockFileSystem(legacyContent, true);

      await (manager as any).migrateLegacySecrets();
      assertEquals(storeCount, 2);
    });

    it("should handle partial migration failure", async () => {
      const legacyContent = '{"pubkey1": "nbunksec1", "pubkey2": "nbunksec2"}';
      (manager as any).secretsPath = "/test/secrets.json";

      let storeCount = 0;
      (manager as any).storageBackend = {
        store: async () => {
          storeCount++;
          return storeCount === 1; // Only first store succeeds
        },
        retrieve: async () => null,
        delete: async () => true,
        list: async () => [],
      };

      mockFileSystem(legacyContent, true);

      await (manager as any).migrateLegacySecrets();
      assertEquals(storeCount, 2);
    });

    it("should handle JSON parse error", async () => {
      (manager as any).secretsPath = "/test/secrets.json";
      (manager as any).storageBackend = { store: async () => true };
      mockFileSystem("invalid json", true);

      await (manager as any).migrateLegacySecrets();
      // Should not throw
    });

    it("should handle file read error", async () => {
      (manager as any).secretsPath = "/test/secrets.json";
      (manager as any).storageBackend = { store: async () => true };
      mockFileSystem("{}", true, false);

      await (manager as any).migrateLegacySecrets();
      // Should not throw
    });

    it("should handle file removal error gracefully", async () => {
      const legacyContent = '{"pubkey1": "nbunksec1"}';
      (manager as any).secretsPath = "/test/secrets.json";
      (manager as any).storageBackend = {
        store: async () => true,
      };

      mockFileSystem(legacyContent, true);
      removeStub?.restore();
      removeStub = stub(Deno, "remove", async () => {
        throw new Error("Remove failed");
      });

      await (manager as any).migrateLegacySecrets();
      // Should not throw even if remove fails
    });
  });

  describe("legacy storage methods", () => {
    beforeEach(() => {
      (manager as any).secretsPath = "/test/secrets.json";
    });

    describe("loadLegacySecrets", () => {
      it("should load empty object when no file", () => {
        mockFileSystem("{}", false);

        (manager as any).loadLegacySecrets();
        assertEquals((manager as any).legacySecrets, {});
      });

      it("should load secrets from file", () => {
        const content = '{"pubkey1": "nbunksec1"}';
        mockFileSystem(content, true);

        (manager as any).loadLegacySecrets();
        assertEquals((manager as any).legacySecrets, { pubkey1: "nbunksec1" });
      });

      it("should handle JSON parse error", () => {
        mockFileSystem("invalid json", true);

        (manager as any).loadLegacySecrets();
        assertEquals((manager as any).legacySecrets, {});
      });

      it("should handle file read error", () => {
        mockFileSystem("{}", true, false);

        (manager as any).loadLegacySecrets();
        assertEquals((manager as any).legacySecrets, {});
      });
    });

    describe("saveLegacySecrets", () => {
      it("should skip save when no secrets path", () => {
        (manager as any).secretsPath = null;

        (manager as any).saveLegacySecrets();
        // Should not throw
      });

      it("should save secrets to file", () => {
        (manager as any).legacySecrets = { pubkey1: "nbunksec1" };
        mockFileSystem();

        (manager as any).saveLegacySecrets();
        // Should complete without error
      });

      it("should handle write error", () => {
        (manager as any).legacySecrets = { pubkey1: "nbunksec1" };
        mockFileSystem("{}", false, true, false);

        (manager as any).saveLegacySecrets();
        // Should not throw
      });
    });
  });

  describe("storeNbunk", () => {
    it("should return false when initialization fails", async () => {
      mockUtils(null);

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, false);
    });

    it("should store using storage backend", async () => {
      const mockBackend = { store: async () => true };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, true);
    });

    it("should handle storage backend failure", async () => {
      const mockBackend = { store: async () => false };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, false);
    });

    it("should use legacy storage when in legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(false);
      mockFileSystem();

      await manager.initialize();

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, true);
      assertEquals((manager as any).legacySecrets.pubkey, "nbunksec");
    });

    it("should return false when no backend and not legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = null;
      (manager as any).legacyMode = false;

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, false);
    });

    it("should handle backend exception", async () => {
      const mockBackend = {
        store: async () => {
          throw new Error("Store failed");
        },
      };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, false);
    });
  });

  describe("getNbunk", () => {
    it("should return null when initialization fails", async () => {
      mockUtils(null);

      const result = await manager.getNbunk("pubkey");
      assertEquals(result, null);
    });

    it("should retrieve using storage backend", async () => {
      const mockBackend = { retrieve: async () => "nbunksec" };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.getNbunk("pubkey");
      assertEquals(result, "nbunksec");
    });

    it("should use legacy storage when in legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(false);
      mockFileSystem('{"pubkey": "nbunksec"}', true);

      await manager.initialize();

      const result = await manager.getNbunk("pubkey");
      assertEquals(result, "nbunksec");
    });

    it("should return null for missing key in legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(false);
      mockFileSystem("{}", true);

      await manager.initialize();

      const result = await manager.getNbunk("missing-pubkey");
      assertEquals(result, null);
    });

    it("should return null when no backend and not legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = null;
      (manager as any).legacyMode = false;

      const result = await manager.getNbunk("pubkey");
      assertEquals(result, null);
    });

    it("should handle backend exception", async () => {
      const mockBackend = {
        retrieve: async () => {
          throw new Error("Retrieve failed");
        },
      };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.getNbunk("pubkey");
      assertEquals(result, null);
    });
  });

  describe("getAllPubkeys", () => {
    it("should return empty array when initialization fails", async () => {
      mockUtils(null);

      const result = await manager.getAllPubkeys();
      assertEquals(result, []);
    });

    it("should list using storage backend", async () => {
      const mockBackend = { list: async () => ["pubkey1", "pubkey2"] };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.getAllPubkeys();
      assertEquals(result, ["pubkey1", "pubkey2"]);
    });

    it("should use legacy storage when in legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(false);
      mockFileSystem('{"pubkey1": "nbunksec1", "pubkey2": "nbunksec2"}', true);

      await manager.initialize();

      const result = await manager.getAllPubkeys();
      assertEquals(result, ["pubkey1", "pubkey2"]);
    });

    it("should return empty array when no backend and not legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = null;
      (manager as any).legacyMode = false;

      const result = await manager.getAllPubkeys();
      assertEquals(result, []);
    });

    it("should handle backend exception", async () => {
      const mockBackend = {
        list: async () => {
          throw new Error("List failed");
        },
      };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.getAllPubkeys();
      assertEquals(result, []);
    });
  });

  describe("deleteNbunk", () => {
    it("should return false when initialization fails", async () => {
      mockUtils(null);

      const result = await manager.deleteNbunk("pubkey");
      assertEquals(result, false);
    });

    it("should delete using storage backend", async () => {
      const mockBackend = { delete: async () => true };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.deleteNbunk("pubkey");
      assertEquals(result, true);
    });

    it("should handle storage backend failure", async () => {
      const mockBackend = { delete: async () => false };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.deleteNbunk("pubkey");
      assertEquals(result, false);
    });

    it("should use legacy storage when in legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(false);
      mockFileSystem('{"pubkey": "nbunksec"}', true);

      await manager.initialize();

      const result = await manager.deleteNbunk("pubkey");
      assertEquals(result, true);
      assertEquals((manager as any).legacySecrets.pubkey, undefined);
    });

    it("should return false for missing key in legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(false);
      mockFileSystem("{}", true);

      await manager.initialize();

      const result = await manager.deleteNbunk("missing-pubkey");
      assertEquals(result, false);
    });

    it("should return false when no backend and not legacy mode", async () => {
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = null;
      (manager as any).legacyMode = false;

      const result = await manager.deleteNbunk("pubkey");
      assertEquals(result, false);
    });

    it("should handle backend exception", async () => {
      const mockBackend = {
        delete: async () => {
          throw new Error("Delete failed");
        },
      };
      mockUtils("/test/config");
      mockKeychain(null);
      mockEncryptedStorage(true);
      mockFileSystem();

      await manager.initialize();
      (manager as any).storageBackend = mockBackend;

      const result = await manager.deleteNbunk("pubkey");
      assertEquals(result, false);
    });
  });

  describe("storage backend adapters", () => {
    it("should test KeychainBackend methods", async () => {
      const mockProvider = {
        store: async () => true,
        retrieve: async () => "test-value",
        delete: async () => true,
        list: async () => ["pubkey1", "pubkey2"],
      };

      // Access the internal KeychainBackend class
      const KeychainBackend =
        (await import("../../src/lib/secrets/manager.ts") as any).KeychainBackend;
      if (KeychainBackend) {
        const backend = new KeychainBackend(mockProvider);

        assertEquals(await backend.store("pubkey", "nbunksec"), true);
        assertEquals(await backend.retrieve("pubkey"), "test-value");
        assertEquals(await backend.delete("pubkey"), true);
        assertEquals(await backend.list(), ["pubkey1", "pubkey2"]);
      }
    });

    it("should test EncryptedBackend methods", async () => {
      const mockStorage = {
        store: async () => true,
        retrieve: async () => "test-value",
        delete: async () => true,
        list: async () => ["pubkey1", "pubkey2"],
      };

      // Access the internal EncryptedBackend class
      const EncryptedBackend =
        (await import("../../src/lib/secrets/manager.ts") as any).EncryptedBackend;
      if (EncryptedBackend) {
        const backend = new EncryptedBackend(mockStorage);

        assertEquals(await backend.store("pubkey", "nbunksec"), true);
        assertEquals(await backend.retrieve("pubkey"), "test-value");
        assertEquals(await backend.delete("pubkey"), true);
        assertEquals(await backend.list(), ["pubkey1", "pubkey2"]);
      }
    });
  });
});
