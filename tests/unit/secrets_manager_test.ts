import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import { SecretsManager } from "../../src/lib/secrets/manager.ts";
import { EncryptedStorage } from "../../src/lib/secrets/encrypted-storage.ts";

describe("secrets/manager - comprehensive branch coverage", () => {
  let manager: SecretsManager;

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
  });

  describe("migrateLegacySecrets", () => {
    it("should skip migration when no secrets path", async () => {
      (manager as any).secretsPath = null;

      await (manager as any).migrateLegacySecrets();
      // No error should occur
    });

    it("should skip migration when file doesn't exist", async () => {
      (manager as any).secretsPath = "/nonexistent/path/secrets.json";

      await (manager as any).migrateLegacySecrets();
      // No error should occur - fileExists returns false for nonexistent path
    });

    it("should skip migration in legacy mode", async () => {
      (manager as any).secretsPath = "/test/secrets.json";
      (manager as any).legacyMode = true;

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

      // Stub Deno.statSync to make fileExists return true
      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      // Stub readTextFile to return empty JSON
      const readTextFileStub = stub(Deno, "readTextFile", async () => "{}");

      await (manager as any).migrateLegacySecrets();
      // No error should occur

      statSyncStub.restore();
      readTextFileStub.restore();
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

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileStub = stub(Deno, "readTextFile", async () => legacyContent);
      const removeStub = stub(Deno, "remove", async () => {});

      await (manager as any).migrateLegacySecrets();
      assertEquals(storeCount, 2);

      statSyncStub.restore();
      readTextFileStub.restore();
      removeStub.restore();
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

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileStub = stub(Deno, "readTextFile", async () => legacyContent);

      await (manager as any).migrateLegacySecrets();
      assertEquals(storeCount, 2);

      statSyncStub.restore();
      readTextFileStub.restore();
    });

    it("should handle JSON parse error", async () => {
      (manager as any).secretsPath = "/test/secrets.json";
      (manager as any).storageBackend = { store: async () => true };

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileStub = stub(Deno, "readTextFile", async () => "invalid json");

      await (manager as any).migrateLegacySecrets();
      // Should not throw

      statSyncStub.restore();
      readTextFileStub.restore();
    });

    it("should handle file read error", async () => {
      (manager as any).secretsPath = "/test/secrets.json";
      (manager as any).storageBackend = { store: async () => true };

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileStub = stub(Deno, "readTextFile", async () => {
        throw new Error("Read failed");
      });

      await (manager as any).migrateLegacySecrets();
      // Should not throw

      statSyncStub.restore();
      readTextFileStub.restore();
    });

    it("should handle file removal error gracefully", async () => {
      const legacyContent = '{"pubkey1": "nbunksec1"}';
      (manager as any).secretsPath = "/test/secrets.json";
      (manager as any).storageBackend = {
        store: async () => true,
      };

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileStub = stub(Deno, "readTextFile", async () => legacyContent);
      const removeStub = stub(Deno, "remove", async () => {
        throw new Error("Remove failed");
      });

      await (manager as any).migrateLegacySecrets();
      // Should not throw even if remove fails

      statSyncStub.restore();
      readTextFileStub.restore();
      removeStub.restore();
    });
  });

  describe("legacy storage methods", () => {
    beforeEach(() => {
      (manager as any).secretsPath = "/test/secrets.json";
    });

    describe("loadLegacySecrets", () => {
      it("should load empty object when no file", () => {
        // statSync throws NotFound for non-existent files
        const statSyncStub = stub(Deno, "statSync", () => {
          throw new Deno.errors.NotFound("not found");
        });

        (manager as any).loadLegacySecrets();
        assertEquals((manager as any).legacySecrets, {});

        statSyncStub.restore();
      });

      it("should load secrets from file", () => {
        const content = '{"pubkey1": "nbunksec1"}';
        const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
        const readTextFileSyncStub = stub(Deno, "readTextFileSync", () => content);

        (manager as any).loadLegacySecrets();
        assertEquals((manager as any).legacySecrets, { pubkey1: "nbunksec1" });

        statSyncStub.restore();
        readTextFileSyncStub.restore();
      });

      it("should handle JSON parse error", () => {
        const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
        const readTextFileSyncStub = stub(Deno, "readTextFileSync", () => "invalid json");

        (manager as any).loadLegacySecrets();
        assertEquals((manager as any).legacySecrets, {});

        statSyncStub.restore();
        readTextFileSyncStub.restore();
      });

      it("should handle file read error", () => {
        const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
        const readTextFileSyncStub = stub(Deno, "readTextFileSync", () => {
          throw new Error("Read failed");
        });

        (manager as any).loadLegacySecrets();
        assertEquals((manager as any).legacySecrets, {});

        statSyncStub.restore();
        readTextFileSyncStub.restore();
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
        const writeTextFileSyncStub = stub(Deno, "writeTextFileSync", () => {});

        (manager as any).saveLegacySecrets();
        // Should complete without error

        writeTextFileSyncStub.restore();
      });

      it("should handle write error", () => {
        (manager as any).legacySecrets = { pubkey1: "nbunksec1" };
        const writeTextFileSyncStub = stub(Deno, "writeTextFileSync", () => {
          throw new Error("Write failed");
        });

        (manager as any).saveLegacySecrets();
        // Should not throw

        writeTextFileSyncStub.restore();
      });
    });
  });

  describe("storeNbunk", () => {
    it("should store using storage backend", async () => {
      const mockBackend = { store: async () => true };
      (manager as any).initialized = true;
      (manager as any).storageBackend = mockBackend;

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, true);
    });

    it("should handle storage backend failure", async () => {
      const mockBackend = { store: async () => false };
      (manager as any).initialized = true;
      (manager as any).storageBackend = mockBackend;

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, false);
    });

    it("should use legacy storage when in legacy mode", async () => {
      (manager as any).initialized = true;
      (manager as any).legacyMode = true;
      (manager as any).storageBackend = null;
      (manager as any).secretsPath = "/test/secrets.json";

      // Stub fileExists via statSync
      const statSyncStub = stub(Deno, "statSync", () => {
        throw new Deno.errors.NotFound("not found");
      });
      const writeTextFileSyncStub = stub(Deno, "writeTextFileSync", () => {});

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, true);
      assertEquals((manager as any).legacySecrets.pubkey, "nbunksec");

      statSyncStub.restore();
      writeTextFileSyncStub.restore();
    });

    it("should return false when no backend and not legacy mode", async () => {
      (manager as any).initialized = true;
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
      (manager as any).initialized = true;
      (manager as any).storageBackend = mockBackend;

      const result = await manager.storeNbunk("pubkey", "nbunksec");
      assertEquals(result, false);
    });
  });

  describe("getNbunk", () => {
    it("should retrieve using storage backend", async () => {
      const mockBackend = { retrieve: async () => "nbunksec" };
      (manager as any).initialized = true;
      (manager as any).storageBackend = mockBackend;

      const result = await manager.getNbunk("pubkey");
      assertEquals(result, "nbunksec");
    });

    it("should use legacy storage when in legacy mode", async () => {
      (manager as any).initialized = true;
      (manager as any).legacyMode = true;
      (manager as any).storageBackend = null;
      (manager as any).secretsPath = "/test/secrets.json";

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileSyncStub = stub(
        Deno,
        "readTextFileSync",
        () => '{"pubkey": "nbunksec"}',
      );

      const result = await manager.getNbunk("pubkey");
      assertEquals(result, "nbunksec");

      statSyncStub.restore();
      readTextFileSyncStub.restore();
    });

    it("should return null for missing key in legacy mode", async () => {
      (manager as any).initialized = true;
      (manager as any).legacyMode = true;
      (manager as any).storageBackend = null;
      (manager as any).secretsPath = "/test/secrets.json";

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileSyncStub = stub(Deno, "readTextFileSync", () => "{}");

      const result = await manager.getNbunk("missing-pubkey");
      assertEquals(result, null);

      statSyncStub.restore();
      readTextFileSyncStub.restore();
    });

    it("should return null when no backend and not legacy mode", async () => {
      (manager as any).initialized = true;
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
      (manager as any).initialized = true;
      (manager as any).storageBackend = mockBackend;

      const result = await manager.getNbunk("pubkey");
      assertEquals(result, null);
    });
  });

  describe("getAllPubkeys", () => {
    it("should list using storage backend", async () => {
      const mockBackend = { list: async () => ["pubkey1", "pubkey2"] };
      (manager as any).initialized = true;
      (manager as any).storageBackend = mockBackend;

      const result = await manager.getAllPubkeys();
      assertEquals(result, ["pubkey1", "pubkey2"]);
    });

    it("should use legacy storage when in legacy mode", async () => {
      (manager as any).initialized = true;
      (manager as any).legacyMode = true;
      (manager as any).storageBackend = null;
      (manager as any).secretsPath = "/test/secrets.json";

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileSyncStub = stub(
        Deno,
        "readTextFileSync",
        () => '{"pubkey1": "nbunksec1", "pubkey2": "nbunksec2"}',
      );

      const result = await manager.getAllPubkeys();
      assertEquals(result, ["pubkey1", "pubkey2"]);

      statSyncStub.restore();
      readTextFileSyncStub.restore();
    });

    it("should return empty array when no backend and not legacy mode", async () => {
      (manager as any).initialized = true;
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
      (manager as any).initialized = true;
      (manager as any).storageBackend = mockBackend;

      const result = await manager.getAllPubkeys();
      assertEquals(result, []);
    });
  });

  describe("deleteNbunk", () => {
    it("should delete using storage backend", async () => {
      const mockBackend = { delete: async () => true };
      (manager as any).initialized = true;
      (manager as any).storageBackend = mockBackend;

      const result = await manager.deleteNbunk("pubkey");
      assertEquals(result, true);
    });

    it("should handle storage backend failure", async () => {
      const mockBackend = { delete: async () => false };
      (manager as any).initialized = true;
      (manager as any).storageBackend = mockBackend;

      const result = await manager.deleteNbunk("pubkey");
      assertEquals(result, false);
    });

    it("should use legacy storage when in legacy mode", async () => {
      (manager as any).initialized = true;
      (manager as any).legacyMode = true;
      (manager as any).storageBackend = null;
      (manager as any).secretsPath = "/test/secrets.json";

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileSyncStub = stub(
        Deno,
        "readTextFileSync",
        () => '{"pubkey": "nbunksec"}',
      );
      const writeTextFileSyncStub = stub(Deno, "writeTextFileSync", () => {});

      const result = await manager.deleteNbunk("pubkey");
      assertEquals(result, true);
      assertEquals((manager as any).legacySecrets.pubkey, undefined);

      statSyncStub.restore();
      readTextFileSyncStub.restore();
      writeTextFileSyncStub.restore();
    });

    it("should return false for missing key in legacy mode", async () => {
      (manager as any).initialized = true;
      (manager as any).legacyMode = true;
      (manager as any).storageBackend = null;
      (manager as any).secretsPath = "/test/secrets.json";

      const statSyncStub = stub(Deno, "statSync", () => ({ isFile: true } as any));
      const readTextFileSyncStub = stub(Deno, "readTextFileSync", () => "{}");

      const result = await manager.deleteNbunk("missing-pubkey");
      assertEquals(result, false);

      statSyncStub.restore();
      readTextFileSyncStub.restore();
    });

    it("should return false when no backend and not legacy mode", async () => {
      (manager as any).initialized = true;
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
      (manager as any).initialized = true;
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
