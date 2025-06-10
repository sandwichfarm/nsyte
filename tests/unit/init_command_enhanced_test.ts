import { assertEquals, assertExists } from "std/assert/mod.ts";
import { spy, stub, restore } from "std/testing/mock.ts";

// We'll test the registerInitCommand by importing it and calling the action directly
import { registerInitCommand } from "../../src/commands/init.ts";
import { Command } from "@cliffy/command";

Deno.test("Init Command - Enhanced Functionality", async (t) => {
  await t.step("should execute action with successful setup", async () => {
    // Mock setupProject to return a successful configuration
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () => Promise.resolve({
        config: {
          relays: ["wss://relay1.com", "wss://relay2.com"],
          servers: ["https://server1.com", "https://server2.com"],
          bunkerPubkey: undefined
        },
        privateKey: "test-private-key-value"
      })
    );

    const consoleLogSpy = spy(console, "log");
    const exitStub = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);
      
      const initCommand = program.getCommands().find(cmd => cmd.getName() === "init");
      assertExists(initCommand);
      
      // Manually trigger the action
      const options = {};
      const args: string[] = [];
      
      // Get the action function and call it
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, options, args);
      }
      
      // Verify console output
      const logCalls = consoleLogSpy.calls.map(call => call.args.join(' '));
      const hasSuccessMessage = logCalls.some(log => 
        log.includes("Project initialized successfully")
      );
      const hasPrivateKeyAuth = logCalls.some(log => 
        log.includes("Authentication: private key")
      );
      const hasRelayCount = logCalls.some(log => 
        log.includes("Relays: 2")
      );
      const hasServerCount = logCalls.some(log => 
        log.includes("Blossom servers: 2")
      );
      const hasConfigPath = logCalls.some(log => 
        log.includes("Configuration saved to .nsite/config.json")
      );
      
      assertEquals(hasSuccessMessage, true);
      assertEquals(hasPrivateKeyAuth, true);
      assertEquals(hasRelayCount, true);
      assertEquals(hasServerCount, true);
      assertEquals(hasConfigPath, true);
      
      // Should exit with success code
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 0);
      
    } finally {
      restore();
    }
  });

  await t.step("should handle bunker configuration", async () => {
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () => Promise.resolve({
        config: {
          relays: ["wss://relay1.com"],
          servers: ["https://server1.com"],
          bunkerPubkey: "npub1testbunkerpubkey"
        },
        privateKey: undefined
      })
    );

    const consoleLogSpy = spy(console, "log");
    const exitStub = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);
      
      const initCommand = program.getCommands().find(cmd => cmd.getName() === "init");
      assertExists(initCommand);
      
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }
      
      const logCalls = consoleLogSpy.calls.map(call => call.args.join(' '));
      const hasBunkerAuth = logCalls.some(log => 
        log.includes("Authentication: bunker connection")
      );
      const hasSuccessMessage = logCalls.some(log => 
        log.includes("Project initialized successfully")
      );
      
      assertEquals(hasBunkerAuth, true);
      assertEquals(hasSuccessMessage, true);
      assertEquals(exitStub.calls[0].args[0], 0);
      
    } finally {
      restore();
    }
  });

  await t.step("should handle setup errors with detailed error message", async () => {
    const errorMessage = "Failed to connect to bunker server";
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () => Promise.reject(new Error(errorMessage))
    );

    const consoleErrorSpy = spy(console, "error");
    const exitStub = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);
      
      const initCommand = program.getCommands().find(cmd => cmd.getName() === "init");
      assertExists(initCommand);
      
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }
      
      const errorCalls = consoleErrorSpy.calls.map(call => call.args.join(' '));
      const hasErrorMessage = errorCalls.some(log => 
        log.includes("Error initializing project") && 
        log.includes(errorMessage)
      );
      
      assertEquals(hasErrorMessage, true);
      assertEquals(exitStub.calls[0].args[0], 1);
      
    } finally {
      restore();
    }
  });

  await t.step("should handle non-Error exceptions", async () => {
    const stringError = "String-based error message";
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () => Promise.reject(stringError)
    );

    const consoleErrorSpy = spy(console, "error");
    const exitStub = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);
      
      const initCommand = program.getCommands().find(cmd => cmd.getName() === "init");
      assertExists(initCommand);
      
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }
      
      const errorCalls = consoleErrorSpy.calls.map(call => call.args.join(' '));
      const hasStringError = errorCalls.some(log => 
        log.includes("Error initializing project") && 
        log.includes(stringError)
      );
      
      assertEquals(hasStringError, true);
      assertEquals(exitStub.calls[0].args[0], 1);
      
    } finally {
      restore();
    }
  });

  await t.step("should handle configuration without authentication", async () => {
    // No private key or bunker pubkey
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () => Promise.resolve({
        config: {
          relays: ["wss://relay1.com"],
          servers: ["https://server1.com"],
          bunkerPubkey: undefined
        },
        privateKey: undefined
      })
    );

    const consoleLogSpy = spy(console, "log");
    const exitStub = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);
      
      const initCommand = program.getCommands().find(cmd => cmd.getName() === "init");
      assertExists(initCommand);
      
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }
      
      // Should not show success message if no auth was configured
      const logCalls = consoleLogSpy.calls.map(call => call.args.join(' '));
      const hasSuccessMessage = logCalls.some(log => 
        log.includes("Project initialized successfully")
      );
      
      assertEquals(hasSuccessMessage, false);
      
      // Should still exit with success
      assertEquals(exitStub.calls[0].args[0], 0);
      
    } finally {
      restore();
    }
  });

  await t.step("should handle empty relay and server lists", async () => {
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () => Promise.resolve({
        config: {
          relays: [],
          servers: [],
          bunkerPubkey: undefined
        },
        privateKey: "test-key"
      })
    );

    const consoleLogSpy = spy(console, "log");
    const exitStub = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);
      
      const initCommand = program.getCommands().find(cmd => cmd.getName() === "init");
      assertExists(initCommand);
      
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }
      
      const logCalls = consoleLogSpy.calls.map(call => call.args.join(' '));
      const hasZeroRelays = logCalls.some(log => log.includes("Relays: 0"));
      const hasZeroServers = logCalls.some(log => log.includes("Blossom servers: 0"));
      
      assertEquals(hasZeroRelays, true);
      assertEquals(hasZeroServers, true);
      
    } finally {
      restore();
    }
  });

  await t.step("should handle large relay and server lists", async () => {
    const manyRelays = Array.from({ length: 10 }, (_, i) => `wss://relay${i}.com`);
    const manyServers = Array.from({ length: 5 }, (_, i) => `https://server${i}.com`);
    
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () => Promise.resolve({
        config: {
          relays: manyRelays,
          servers: manyServers,
          bunkerPubkey: "test-bunker"
        },
        privateKey: undefined
      })
    );

    const consoleLogSpy = spy(console, "log");
    const exitStub = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);
      
      const initCommand = program.getCommands().find(cmd => cmd.getName() === "init");
      assertExists(initCommand);
      
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }
      
      const logCalls = consoleLogSpy.calls.map(call => call.args.join(' '));
      const hasManyRelays = logCalls.some(log => log.includes("Relays: 10"));
      const hasManyServers = logCalls.some(log => log.includes("Blossom servers: 5"));
      
      assertEquals(hasManyRelays, true);
      assertEquals(hasManyServers, true);
      
    } finally {
      restore();
    }
  });
});