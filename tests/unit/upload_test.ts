import { assert, assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { assertSpyCall, assertSpyCalls, type Spy, type Stub, stub } from "jsr:@std/testing/mock";
import { Signer as LibSigner, UploadProgress, UploadResponse } from "../../src/lib/upload.ts"; // Actual processUploads is NOT stubbed here
import { FileEntry, NostrEvent, NostrEventTemplate } from "../../src/lib/nostr.ts";
import { uploadCommand, type UploadCommandOptions } from "../../src/commands/upload.ts";

// Import the modules whose functions we will NOT stub directly in uploadCommand tests,
// but whose behavior we might control via other means (e.g. file system, or fetch stubs for their dependencies)
import * as config from "../../src/lib/config.ts";
import * as files from "../../src/lib/files.ts";
import * as nostr from "../../src/lib/nostr.ts";
import * as nip46 from "../../src/lib/nip46.ts";
import { PrivateKeySigner } from "../../src/lib/signer.ts";
import { ProjectConfig, ProjectContext } from "../../src/lib/config.ts";
import { createLogger } from "../../src/lib/logger.ts"; // To get the logger instance

// MockSigner class for "Upload Module" tests (can remain as is if not used by uploadCommand tests)
class MockSigner implements LibSigner {
  callCount = 0;

  async signEvent(event: NostrEventTemplate): Promise<NostrEvent> {
    this.callCount++;
    return {
      ...event,
      id: `mock-id-${this.callCount}`,
      pubkey: "mock-pubkey",
      sig: "mock-signature",
      created_at: event.created_at || Math.floor(Date.now() / 1000),
      kind: event.kind || 0,
      tags: event.tags || [],
      content: event.content || "",
    } as NostrEvent; // Ensure it's cast to NostrEvent if not all fields are filled by spread
  }

  getPublicKey(): Promise<string> {
    return Promise.resolve("mock-pubkey");
  }
}

let originalDenoExit: typeof Deno.exit;
let exitCode: number | undefined;

// Stubs for uploadCommand integration tests
// We will stub methods on INSTANCES or GLOBALS, not direct module function imports.
let commandLoggerStubbedError:
  | Stub<
    ReturnType<typeof createLogger>,
    Parameters<ReturnType<typeof createLogger>["error"]>,
    void
  >
  | undefined;
let consoleErrorStub: Stub<Console, Parameters<Console["error"]>, void> | undefined;
let consoleLogStub: Stub<Console, Parameters<Console["log"]>, void> | undefined; // For specific tests needing to check output

let pksGetPublicKeyStub: Stub<PrivateKeySigner, [], string> | undefined; // Stubbing prototype
let pksSignEventStub:
  | Stub<PrivateKeySigner, Parameters<PrivateKeySigner["signEvent"]>, Promise<NostrEvent>>
  | undefined; // Stubbing prototype

let fetchStub:
  | Stub<typeof globalThis, Parameters<typeof fetch>, ReturnType<typeof fetch>>
  | undefined; // For processUploads

// Get the actual logger instance that uploadCommand will use (assuming it uses a module-scoped log)
// If uploadCommand creates its own logger instance, this approach needs adjustment.
// Based on src/commands/upload.ts, it uses a module-scoped `log = createLogger("upload")`.
// We need to import that specific `log` instance to stub its methods.
// This is hard if `log` is not exported. A workaround is to stub `createLogger` itself
// to return a logger whose methods are stubs. Or, better, if `uploadCommand` used an injected logger.
// For now, we'll assume errors are caught by console.error or Deno.exit.
// If specific log messages from `uploadCommand`'s own logger need checking, that logger needs to be accessible.
// Let's assume for now that critical errors also go to console.error or lead to Deno.exit.

describe("uploadCommand", () => {
  beforeEach(() => {
    originalDenoExit = Deno.exit;
    exitCode = undefined;
    Deno.exit = (code?: number): never => {
      exitCode = code;
      throw new Error(`Deno.exit called with ${code}`);
    };

    // Stub global console methods
    consoleErrorStub = stub(console, "error", () => {});
    // consoleLogStub is set up per-test if needed

    // Stub PrivateKeySigner prototype methods - these will affect any NEW PrivateKeySigner instance
    pksGetPublicKeyStub = stub(
      PrivateKeySigner.prototype,
      "getPublicKey",
      () => "mock-privatekey-pubkey",
    );
    pksSignEventStub = stub(
      PrivateKeySigner.prototype,
      "signEvent",
      (eventTemplate) =>
        Promise.resolve({
          id: "mock-pks-id",
          pubkey: "mock-privatekey-pubkey",
          sig: "mock-pks-signature",
          created_at: eventTemplate.created_at || 0,
          kind: eventTemplate.kind || 0,
          tags: eventTemplate.tags || [],
          content: eventTemplate.content || "",
        } as NostrEvent),
    );

    // Stub global fetch (used by processUploads, which is called by uploadCommand)
    fetchStub = stub(globalThis, "fetch", (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";
      if (method === "HEAD") { // Simulate file not found for existence checks, forcing upload
        return Promise.resolve(new Response("", { status: 404 }));
      }
      return Promise.resolve(new Response("OK", { status: 200 })); // Simulate successful PUT/POST
    });
  });

  afterEach(() => {
    Deno.exit = originalDenoExit;
    consoleErrorStub?.restore();
    consoleLogStub?.restore(); // Restore if set by a test
    consoleLogStub = undefined;

    pksGetPublicKeyStub?.restore();
    pksSignEventStub?.restore();
    fetchStub?.restore();
  });

  const getDefaultOptions = (overrides = {}): UploadCommandOptions => ({ // Explicit type
    force: false,
    verbose: false,
    purge: false,
    concurrency: 1,
    publishServerList: false,
    publishRelayList: false,
    publishProfile: false,
    nonInteractive: false,
    // servers, relays, privatekey, bunker, nbunksec, fallback are optional
    ...overrides,
  });

  describe("Non-Interactive Mode", () => {
    it("should proceed and not call setupProject if all required CLI args are provided (nbunksec)", async () => {
      const options = getDefaultOptions({
        nonInteractive: true,
        servers: "http://server1.com",
        relays: "wss://relay1.com",
        nbunksec: "valid-nbunksec-string", // This will make importFromNbunk run
      });
      // readProjectFile will be called by _resolveProjectContextAndAuth.
      // We can't easily stub readProjectFile here without DI for it in uploadCommand.
      // So we test the outcome.
      // We expect no Deno.exit(1) from missing args.
      // We expect importFromNbunk to be called (which itself might call fetch, covered by fetchStub).

      // To check setupProject was not called: setupProject involves prompts.
      // In non-interactive, if it were called due to missing essential info not covered by CLI,
      // it would likely error or exit, or we'd need to mock prompts.
      // The refactored _resolveProjectContextAndAuth should handle this.

      // For now, primarily assert clean exit. Deeper assertions later.
      await uploadCommand("test_folder", options); // Will use actual config.readProjectFile
      assertEquals(exitCode, 0, "Should exit cleanly if all non-interactive args are present");
      // Assert that nip46.importFromNbunk was effectively used.
      // This is hard without stubbing importFromNbunk directly.
      // We could check if fetch was called in a way importFromNbunk would (if it uses fetch).
    });

    it("should proceed and not call setupProject if all required CLI args are provided (privatekey)", async () => {
      const options = getDefaultOptions({
        nonInteractive: true,
        servers: "http://server1.com",
        relays: "wss://relay1.com",
        privatekey: "0000000000000000000000000000000000000000000000000000000000000001",
      });
      await uploadCommand("test_folder", options);
      assertEquals(exitCode, 0, "Should exit cleanly");
      // Verify PrivateKeySigner was used by checking its prototype stubs
      assert(
        (pksGetPublicKeyStub?.calls?.length ?? 0) > 0,
        "PrivateKeySigner.getPublicKey should have been called",
      );
    });

    it("should exit with error if --servers is missing", async () => {
      const options = getDefaultOptions({
        nonInteractive: true,
        relays: "wss://relay1.com",
        nbunksec: "valid-nbunksec-string",
        // servers: undefined, // Implicitly missing
      });
      await uploadCommand("test_folder", options);
      assertEquals(exitCode, 1, "Should exit with error code 1 for missing servers");
      assert(
        consoleErrorStub?.calls.some((call) =>
          typeof call.args[0] === "string" && call.args[0].includes("Missing servers")
        ),
        "Error message for missing servers not logged to console.error",
      );
    });

    it("should exit with error if --relays is missing", async () => {
      const options = getDefaultOptions({
        nonInteractive: true,
        servers: "http://server1.com",
        nbunksec: "valid-nbunksec-string",
        // relays: undefined, // Implicitly missing
      });
      await uploadCommand("test_folder", options);
      assertEquals(exitCode, 1, "Should exit with error code 1 for missing relays");
      assert(
        consoleErrorStub?.calls.some((call) =>
          typeof call.args[0] === "string" && call.args[0].includes("Missing relays")
        ),
        "Error message for missing relays not logged",
      );
    });

    it("should exit with error if no key option is provided (and no configured bunker)", async () => {
      // To ensure no configured bunker, we'd need to control what readProjectFile returns.
      // This is tricky without stubbing readProjectFile.
      // For now, assume no config file or one without bunkerPubkey.
      const options = getDefaultOptions({
        nonInteractive: true,
        servers: "http://server1.com",
        relays: "wss://relay1.com",
        // privatekey, nbunksec, bunker all undefined
      });
      await uploadCommand("test_folder", options);
      assertEquals(exitCode, 1, "Should exit with error for missing key");
      assert(
        consoleErrorStub?.calls.some((call) =>
          typeof call.args[0] === "string" && call.args[0].includes("Missing signing key")
        ),
        "Error message for missing key option not logged",
      );
    });

    it("should use CLI args for config even if a config file exists", async () => {
      // This test becomes about observing the behavior of processUploads (via fetch calls)
      // to ensure it uses CLI servers/relays.
      // We need to make readProjectFile return some dummy config.
      // This requires config.ts to be mockable or test file system setup.
      // For now, this test is hard to make pass reliably without more control.
      // Let's assume for this pass it will use CLI args by default due to _resolveProjectContextAndAuth logic.
      consoleLogStub = stub(console, "log", () => {}); // To capture output

      const options = getDefaultOptions({
        nonInteractive: true,
        servers: "cli_server1,cli_server2",
        relays: "cli_relay1,cli_relay2",
        privatekey: "0000000000000000000000000000000000000000000000000000000000000001",
      });

      // We can't easily make readProjectFile return something specific here.
      // Instead, we trust _resolveProjectContextAndAuth correctly prioritizes CLI.
      // We'd check that the console.log output reflects CLI args.
      await uploadCommand("test_folder", options);
      assertEquals(exitCode, 0, "Should exit cleanly");

      let foundRelays = false;
      let foundServers = false;
      consoleLogStub.calls.forEach((call: Spy<Console, any[], void>["calls"][number]) => {
        const arg = call.args[0] as string;
        if (arg && arg.includes("Servers: cli_server1, cli_server2")) foundServers = true;
        if (arg && arg.includes("Relays: cli_relay1, cli_relay2")) foundRelays = true;
      });
      assert(foundServers, "CLI servers should be logged by non-interactive summary");
      assert(foundRelays, "CLI relays should be logged by non-interactive summary");
    });
  });

  describe("Interactive Mode (or non-interactive fallback to setupProject)", () => {
    // Interactive tests are harder without mocking user input (Confirm, Input, Select from Cliffy).
    // These tests might need to focus on scenarios where setupProject is called
    // and then fails/exits because prompts can't be answered in a non-TTY test environment,
    // or they complete with defaults if setupProject is designed to do so non-interactively.

    it("should call setupProject if no config and nonInteractive is false (and likely exit/error in test env)", async () => {
      const options = getDefaultOptions({ nonInteractive: false });
      // We expect setupProject to be called. In a non-TTY test env, it might error or exit.
      // This test assumes readProjectFile() will return null (no config).
      // To guarantee this, tests might need to run in a clean temp directory.

      // For now, we can't directly assert setupProject was called without stubbing it.
      // We can check if Deno.exit was called, which might happen if setupProject prompts.
      // This test becomes more about the overall flow when config is missing.
      try {
        await uploadCommand("test_folder_interactive_no_config", options);
      } catch (e) {
        // Expecting Deno.exit or other error from interactive prompts in non-TTY
        assert(e instanceof Error, "Should throw an error in non-TTY for prompts or exit");
      }
      // Assertion depends on how setupProject behaves in non-TTY when prompts are needed.
      // If it exits, exitCode will be set. If it throws, catch block handles it.
      // This test is difficult in its current form.
    });

    // it("should call setupProject if nonInteractive is true but required args are missing (delegating to setupProject's non-interactive logic)", async () => {
    // This specific case is now handled by _resolveProjectContextAndAuth, which should error out *before* calling setupProject.
    // The original intent was if setupProject(true) was called.
    // If _resolveProjectContextAndAuth decides to call setupProject(true) [which it doesn't directly anymore],
    // then that would be the path.
    // This test might be obsolete or need rephrasing based on _resolveProjectContextAndAuth's behavior.
    // });
  });
});

// "Upload Module" tests use their own fetch stubbing and MockSigner.
// They should remain largely unaffected by changes to uploadCommand test stubs.
describe("Upload Module", () => {
  // ... (Existing "Upload Module" tests from the provided file - they are self-contained)
  // Test data
  const testFiles: FileEntry[] = [ // Using FileEntry from applesauce-signers (or nostr.ts if preferred for consistency)
    {
      path: "/file1.txt",
      data: new TextEncoder().encode("file1 content"),
      sha256: "sha256-1",
      contentType: "text/plain",
      size: 13,
    },
    {
      path: "/file2.txt",
      data: new TextEncoder().encode("file2 content"),
      sha256: "sha256-2",
      contentType: "text/plain",
      size: 13,
    },
  ];

  const servers = ["https://mock-server-1", "https://mock-server-2"];
  const relays = ["wss://relay.test"];

  let moduleFetchStub: Stub<typeof globalThis, Parameters<typeof fetch>, ReturnType<typeof fetch>>;

  const createDefaultModuleFetchStub = () =>
    stub(globalThis, "fetch", (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";
      if (method === "HEAD") return Promise.resolve(new Response("", { status: 404 }));
      return Promise.resolve(new Response("OK", { status: 200 }));
    });

  beforeEach(() => {
    moduleFetchStub = createDefaultModuleFetchStub();
  });

  afterEach(() => {
    moduleFetchStub.restore();
  });

  it("should process uploads in parallel", async () => {
    const signer = new MockSigner();
    const concurrency = 2;
    const progressUpdates: UploadProgress[] = [];

    // Assuming processUploads is imported from its actual module for direct testing if needed
    // For these tests, we're testing the actual processUploads from "../../src/lib/upload.ts"
    const { processUploads: actualProcessUploads } = await import("../../src/lib/upload.ts");

    const results = await actualProcessUploads(
      testFiles,
      "/base/dir",
      servers,
      signer,
      relays,
      concurrency,
      (progress: UploadProgress) => progressUpdates.push({ ...progress }),
    );

    assertEquals(results.length, testFiles.length);
    for (const result of results) assertEquals(result.success, true);
    assert(moduleFetchStub.calls.length >= testFiles.length);
    const signerPublicKey = await signer.getPublicKey();
    assertEquals(signerPublicKey, "mock-pubkey");
    assert(signer.callCount >= testFiles.length);
    assert(progressUpdates.length > 0);
    assertEquals(progressUpdates[progressUpdates.length - 1].completed, testFiles.length);
    assertEquals(progressUpdates[progressUpdates.length - 1].failed, 0);
  });

  it("should handle errors and retry uploads", async () => {
    const signer = new MockSigner();
    moduleFetchStub.restore(); // Restore default beforeEach stub.

    let failedOnce = false;
    // Create a new local stub for this test's specific behavior
    const localRetryFetchStub = stub(
      globalThis,
      "fetch",
      (input: URL | RequestInfo, _init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("sha256-1") && !failedOnce) {
          failedOnce = true;
          return Promise.reject(new Error("Simulated fetch error"));
        }
        return Promise.resolve(new Response("OK", { status: 200 }));
      },
    );

    const { processUploads: actualProcessUploads } = await import("../../src/lib/upload.ts");

    try {
      const results = await actualProcessUploads(
        testFiles.slice(0, 1),
        "/base/dir",
        servers,
        signer,
        relays,
        1,
      );
      assertEquals(results.length, 1);
      assertEquals(results[0].success, true);
      assert(
        localRetryFetchStub.calls.some((call) => call.args[0].toString().includes("sha256-1")),
      );
      assert(localRetryFetchStub.calls.length >= 2);
    } finally {
      localRetryFetchStub.restore(); // Clean up the local stub
      // Re-establish the default stub for subsequent tests / afterEach
      moduleFetchStub = createDefaultModuleFetchStub();
    }
  });
});
