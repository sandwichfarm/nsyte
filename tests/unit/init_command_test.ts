import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Command } from "@cliffy/command";
import { restore, spy, stub } from "std/testing/mock.ts";
import { registerInitCommand } from "../../src/commands/init.ts";

Deno.test("Init Command - Registration", async (t) => {
  await t.step("should register init command", () => {
    const program = new Command();
    registerInitCommand(program);

    const commands = program.getCommands();
    const initCommand = commands.find((cmd) => cmd.getName() === "init");

    assertExists(initCommand);
    assertEquals(initCommand.getName(), "init");
    assertEquals(initCommand.getDescription(), "Initialize a new nsyte project");
  });
});

Deno.test("Init Command - Success Path", async (t) => {
  await t.step("should initialize project with private key", async () => {
    // Mock setupProject to return success
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () =>
        Promise.resolve({
          config: {
            relays: ["wss://relay1.com", "wss://relay2.com"],
            servers: ["https://server1.com", "https://server2.com"],
            bunkerPubkey: undefined,
          },
          privateKey: "test-private-key",
        }),
    );

    // Mock console.log to capture output
    const consoleLogSpy = spy(console, "log");

    // Mock Deno.exit to prevent actual exit
    const exitSpy = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);

      const initCommand = program.getCommands().find((cmd) => cmd.getName() === "init");
      assertExists(initCommand);

      // Execute the command action
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }

      // Verify console output
      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasSuccessMessage = logCalls.some((log) =>
        log.includes("Project initialized successfully")
      );
      const hasPrivateKeyAuth = logCalls.some((log) => log.includes("Authentication: private key"));
      const hasRelayCount = logCalls.some((log) => log.includes("Relays: 2"));
      const hasServerCount = logCalls.some((log) => log.includes("Blossom servers: 2"));
      const hasConfigPath = logCalls.some((log) =>
        log.includes("Configuration saved to .nsite/config.json")
      );

      assertEquals(hasSuccessMessage, true);
      assertEquals(hasPrivateKeyAuth, true);
      assertEquals(hasRelayCount, true);
      assertEquals(hasServerCount, true);
      assertEquals(hasConfigPath, true);

      // Verify exit(0) was called
      assertEquals(exitSpy.calls.length, 1);
      assertEquals(exitSpy.calls[0].args[0], 0);
    } finally {
      restore();
    }
  });

  await t.step("should initialize project with bunker connection", async () => {
    // Mock setupProject to return bunker success
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () =>
        Promise.resolve({
          config: {
            relays: ["wss://relay1.com"],
            servers: ["https://server1.com"],
            bunkerPubkey: "test-bunker-pubkey",
          },
          privateKey: undefined,
        }),
    );

    // Mock console.log to capture output
    const consoleLogSpy = spy(console, "log");

    // Mock Deno.exit
    const exitSpy = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);

      const initCommand = program.getCommands().find((cmd) => cmd.getName() === "init");
      assertExists(initCommand);

      // Execute the command action
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }

      // Verify console output
      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasBunkerAuth = logCalls.some((log) =>
        log.includes("Authentication: bunker connection")
      );

      assertEquals(hasBunkerAuth, true);

      // Verify exit(0) was called
      assertEquals(exitSpy.calls.length, 1);
      assertEquals(exitSpy.calls[0].args[0], 0);
    } finally {
      restore();
    }
  });
});

Deno.test("Init Command - Error Handling", async (t) => {
  await t.step("should handle setup errors gracefully", async () => {
    // Mock setupProject to throw error
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () => Promise.reject(new Error("Setup failed")),
    );

    // Mock console.error to capture error output
    const consoleErrorSpy = spy(console, "error");

    // Mock Deno.exit
    const exitSpy = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);

      const initCommand = program.getCommands().find((cmd) => cmd.getName() === "init");
      assertExists(initCommand);

      // Execute the command action
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }

      // Verify error output
      const errorCalls = consoleErrorSpy.calls.map((call) => call.args.join(" "));
      const hasErrorMessage = errorCalls.some((log) =>
        log.includes("Error initializing project") && log.includes("Setup failed")
      );

      assertEquals(hasErrorMessage, true);

      // Verify exit(1) was called
      assertEquals(exitSpy.calls.length, 1);
      assertEquals(exitSpy.calls[0].args[0], 1);
    } finally {
      restore();
    }
  });

  await t.step("should handle non-Error exceptions", async () => {
    // Mock setupProject to throw non-Error
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () => Promise.reject("String error"),
    );

    // Mock console.error to capture error output
    const consoleErrorSpy = spy(console, "error");

    // Mock Deno.exit
    const exitSpy = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);

      const initCommand = program.getCommands().find((cmd) => cmd.getName() === "init");
      assertExists(initCommand);

      // Execute the command action
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }

      // Verify error output with string conversion
      const errorCalls = consoleErrorSpy.calls.map((call) => call.args.join(" "));
      const hasStringError = errorCalls.some((log) =>
        log.includes("Error initializing project") && log.includes("String error")
      );

      assertEquals(hasStringError, true);

      // Verify exit(1) was called
      assertEquals(exitSpy.calls.length, 1);
      assertEquals(exitSpy.calls[0].args[0], 1);
    } finally {
      restore();
    }
  });

  await t.step("should handle config without auth", async () => {
    // Mock setupProject to return config without auth
    const mockSetupProject = stub(
      await import("../../src/lib/config.ts"),
      "setupProject",
      () =>
        Promise.resolve({
          config: {
            relays: ["wss://relay1.com"],
            servers: ["https://server1.com"],
            bunkerPubkey: undefined,
          },
          privateKey: undefined,
        }),
    );

    // Mock console.log to verify no success message
    const consoleLogSpy = spy(console, "log");

    // Mock Deno.exit
    const exitSpy = stub(Deno, "exit", () => {});

    try {
      const program = new Command();
      registerInitCommand(program);

      const initCommand = program.getCommands().find((cmd) => cmd.getName() === "init");
      assertExists(initCommand);

      // Execute the command action
      const action = initCommand.getAction();
      if (action) {
        await action.call(initCommand, {}, []);
      }

      // Verify no success message was logged (since no auth was set up)
      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasSuccessMessage = logCalls.some((log) =>
        log.includes("Project initialized successfully")
      );

      assertEquals(hasSuccessMessage, false);

      // Still should exit(0)
      assertEquals(exitSpy.calls.length, 1);
      assertEquals(exitSpy.calls[0].args[0], 0);
    } finally {
      restore();
    }
  });
});
