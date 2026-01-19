// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "jsr:@std/assert";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { restore, type Stub, stub } from "jsr:@std/testing/mock";

import { createMockSecretsManager } from "../mocks/secrets-manager.ts";

// Test state
let exitStub: Stub;
let consoleOutput: { logs: string[]; errors: string[] };
let originalLog: typeof console.log;
let originalError: typeof console.error;
let mockSecretsManager: ReturnType<typeof createMockSecretsManager>;

describe("Bunker Modular Tests", () => {
  beforeEach(() => {
    // Create fresh mock
    mockSecretsManager = createMockSecretsManager();

    // Setup exit stub
    exitStub = stub(
      Deno,
      "exit",
      ((code?: number) => {
        (exitStub as any).lastExitCode = code;
        return undefined as never;
      }) as any,
    );

    // Setup console capture
    consoleOutput = { logs: [], errors: [] };
    originalLog = console.log;
    originalError = console.error;

    console.log = (...args: unknown[]) => {
      consoleOutput.logs.push(args.map(String).join(" "));
    };

    console.error = (...args: unknown[]) => {
      consoleOutput.errors.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    // Restore all stubs
    restore();

    // Restore console
    console.log = originalLog;
    console.error = originalError;
  });

  describe("showBunkerHelp", () => {
    it("should display help information", async () => {
      // Import and call directly without module-level stubbing
      const { showBunkerHelp } = await import("../../src/commands/bunker.ts");

      await showBunkerHelp();
      const output = [...consoleOutput.logs, ...consoleOutput.errors].join("\n");

      assertEquals(output.includes("Usage: nsyte bunker"), true);
      assertEquals(output.includes("Available actions:"), true);
      assertEquals(output.includes("Connection examples:"), true);
      assertEquals(output.includes("CI/CD Usage:"), true);
    });
  });

  describe("basic imports work", () => {
    it("should import bunker functions without system access", async () => {
      // This test verifies that we can import the bunker module
      // without triggering any system calls
      const bunkerModule = await import("../../src/commands/bunker.ts");

      assertExists(bunkerModule.showBunkerHelp);
      assertExists(bunkerModule.listBunkers);
      assertExists(bunkerModule.importNbunk);
      assertExists(bunkerModule.exportNbunk);
    });
  });

  describe("mock verification", () => {
    it("should have working mock SecretsManager", async () => {
      // Test that our mock works
      await mockSecretsManager.storeNbunk("test", "value");
      assertEquals(await mockSecretsManager.getNbunk("test"), "value");

      const pubkeys = await mockSecretsManager.getAllPubkeys();
      assertEquals(pubkeys, ["test"]);

      const deleted = await mockSecretsManager.deleteNbunk("test");
      assertEquals(deleted, true);
      assertEquals(await mockSecretsManager.getNbunk("test"), null);
    });
  });

  describe("environment verification", () => {
    it("should have keychain disabled", () => {
      assertEquals(Deno.env.get("NSYTE_DISABLE_KEYCHAIN"), "true");
      assertEquals(Deno.env.get("NSYTE_TEST_MODE"), "true");
    });

    it("should block keychain provider", async () => {
      // This should return null due to our mocking
      const { getKeychainProvider } = await import("../../src/lib/secrets/keychain.ts");
      const provider = await getKeychainProvider();
      assertEquals(provider, null);
    });
  });
});
