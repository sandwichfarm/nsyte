import { assertEquals, assertRejects } from "std/assert/mod.ts";
import { 
  stubExit, 
  createMockSecretsManager,
  captureConsole,
  createTestDirectory,
  mockInteractivePrompts,
} from "../mocks/index.ts";

Deno.test("Mock Utilities", async (t) => {
  await t.step("stubExit prevents process exit", () => {
    const exitStub = stubExit();
    
    try {
      // This should not actually exit the process
      Deno.exit(0);
      Deno.exit(1);
      
      // Check that exit was called
      assertEquals(exitStub.calls.length, 2);
      assertEquals(exitStub.calls[0].args[0], 0);
      assertEquals(exitStub.calls[1].args[0], 1);
    } finally {
      exitStub.restore();
    }
  });

  await t.step("createMockSecretsManager provides working mock", async () => {
    const mockData = {
      "pubkey1": "nbunk1",
      "pubkey2": "nbunk2",
    };
    
    const mock = createMockSecretsManager(mockData);
    
    // Test getAllPubkeys
    const pubkeys = await mock.getAllPubkeys();
    assertEquals(pubkeys.sort(), ["pubkey1", "pubkey2"]);
    
    // Test getNbunk
    assertEquals(await mock.getNbunk("pubkey1"), "nbunk1");
    assertEquals(await mock.getNbunk("pubkey2"), "nbunk2");
    assertEquals(await mock.getNbunk("nonexistent"), null);
    
    // Test storeNbunk
    const stored = await mock.storeNbunk("pubkey3", "nbunk3");
    assertEquals(stored, true);
    assertEquals(await mock.getNbunk("pubkey3"), "nbunk3");
    
    // Test deleteNbunk
    const deleted = await mock.deleteNbunk("pubkey1");
    assertEquals(deleted, true);
    assertEquals(await mock.getNbunk("pubkey1"), null);
    
    const deletedNonExistent = await mock.deleteNbunk("nonexistent");
    assertEquals(deletedNonExistent, false);
  });

  await t.step("captureConsole captures output", () => {
    const capture = captureConsole();
    
    console.log("test log 1");
    console.log("test log 2");
    console.error("test error");
    
    assertEquals(capture.logs, ["test log 1", "test log 2"]);
    assertEquals(capture.errors, ["test error"]);
    assertEquals(capture.getOutput(), "test log 1\ntest log 2\ntest error");
    
    capture.restore();
    
    // Verify console is restored
    console.log("This should not be captured");
    assertEquals(capture.logs.length, 2); // Still only 2
  });

  await t.step("createTestDirectory creates and cleans up", () => {
    const testDir = createTestDirectory("mock_test");
    
    // Directory should exist
    const stats = Deno.statSync(testDir.path);
    assertEquals(stats.isDirectory, true);
    
    // Write a test file
    const testFile = `${testDir.path}/test.txt`;
    Deno.writeTextFileSync(testFile, "test content");
    
    // Cleanup should remove everything
    testDir.cleanup();
    
    // Directory should not exist
    let exists = true;
    try {
      Deno.statSync(testDir.path);
    } catch {
      exists = false;
    }
    assertEquals(exists, false);
  });

  await t.step("mockInteractivePrompts blocks prompts", async () => {
    const mocks = await mockInteractivePrompts();
    
    try {
      // Import fresh to ensure our mock is applied
      const confirmModule = await import("@cliffy/prompt/confirm");
      
      // Try to call prompt - it should throw
      let errorThrown = false;
      try {
        await confirmModule.Confirm.prompt({ message: "test" });
      } catch (error) {
        errorThrown = true;
        assertEquals(error instanceof Error, true);
        assertEquals(error.message.includes("Interactive"), true);
      }
      
      assertEquals(errorThrown, true, "Should have thrown an error");
    } finally {
      mocks.restore();
    }
  });
});