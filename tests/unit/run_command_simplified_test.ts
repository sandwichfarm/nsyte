import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert";
import { restore, stub } from "jsr:@std/testing/mock";
import { Command } from "@cliffy/command";
import {
  formatFileSize,
  registerRunCommand,
  runCommand,
  validateNpub,
} from "../../src/commands/run.ts";

Deno.test("Run Command - Registration", async (t) => {
  await t.step("should register run command with correct options", () => {
    const program = new Command();
    registerRunCommand(program);

    const runCommandInstance = program.getCommand("run");
    assertExists(runCommandInstance);
    assertEquals(runCommandInstance.getName(), "run");
    assertEquals(
      runCommandInstance.getDescription(),
      "Run a resolver server that serves nsites via npub subdomains",
    );

    // Check that all options are registered
    const options = runCommandInstance.getOptions();
    const optionNames = options.map((opt) => opt.name);

    assertEquals(optionNames.includes("relays"), true);
    assertEquals(optionNames.includes("port"), true);
    assertEquals(optionNames.includes("privatekey"), true);
    assertEquals(optionNames.includes("bunker"), true);
    assertEquals(optionNames.includes("nbunksec"), true);
  });

  await t.step("should have correct default values", () => {
    const program = new Command();
    registerRunCommand(program);

    const runCommandInstance = program.getCommand("run");
    assertExists(runCommandInstance);
    const portOption = runCommandInstance.getOption("port");
    assertEquals(portOption?.default, 8080);
  });
});

Deno.test("Run Command - Utility Functions", async (t) => {
  await t.step("validateNpub - should validate correct npub format", () => {
    // Test invalid formats
    assertEquals(validateNpub("invalid"), false);
    assertEquals(validateNpub("npub1short"), false);
    assertEquals(
      validateNpub("nsec1w0rthlessness0000000000000000000000000000000000000000000000000"),
      false,
    );
    assertEquals(validateNpub(""), false);
  });

  await t.step("formatFileSize - should format file sizes correctly", () => {
    assertEquals(formatFileSize(0), "0 B");
    assertEquals(formatFileSize(1), "1 B");
    assertEquals(formatFileSize(1024), "1 KB");
    assertEquals(formatFileSize(1536), "1.5 KB");
    assertEquals(formatFileSize(1048576), "1 MB");
    assertEquals(formatFileSize(1073741824), "1 GB");
  });
});

Deno.test("Run Command - Server Setup", async (t) => {
  await t.step("should handle no relays configured", async () => {
    // Mock resolveRelays to return empty array
    const resolveRelaysStub = stub(
      await import("../../src/lib/resolver-utils.ts"),
      "resolveRelays",
      () => [],
    );

    const consoleErrorStub = stub(console, "error");
    const processExitStub = stub(Deno, "exit");

    try {
      await runCommand({ port: 8080 });

      // Should have called console.error and Deno.exit
      assertEquals(consoleErrorStub.calls.length > 0, true);
      assertEquals(processExitStub.calls.length > 0, true);

      const errorMessage = consoleErrorStub.calls[0].args[0];
      assertStringIncludes(errorMessage, "No relays available");
    } finally {
      resolveRelaysStub.restore();
      consoleErrorStub.restore();
      processExitStub.restore();
    }
  });

  await t.step("should handle error during server startup", async () => {
    // Mock resolveRelays to throw error
    const resolveRelaysStub = stub(
      await import("../../src/lib/resolver-utils.ts"),
      "resolveRelays",
      () => {
        throw new Error("Resolver error");
      },
    );

    const handleErrorStub = stub(
      await import("../../src/lib/error-utils.ts"),
      "handleError",
    );

    try {
      await runCommand({ port: 8080 });

      // Should have called handleError
      assertEquals(handleErrorStub.calls.length > 0, true);

      const errorCall = handleErrorStub.calls[0];
      assertEquals(errorCall.args[0], "Error running resolver server");
      assertEquals(errorCall.args[1] instanceof Error, true);
      assertEquals(errorCall.args[2]?.exit, true);
    } finally {
      resolveRelaysStub.restore();
      handleErrorStub.restore();
    }
  });
});

Deno.test("Run Command - Validation Functions", async (t) => {
  await t.step("should handle bech32 decode errors gracefully", async () => {
    // Mock bech32Decode to throw error
    const bech32DecodeStub = stub(
      await import("../../src/lib/utils.ts"),
      "bech32Decode",
      () => {
        throw new Error("Invalid bech32");
      },
    );

    try {
      const result = validateNpub("invalid");
      assertEquals(result, false);
    } finally {
      bech32DecodeStub.restore();
    }
  });

  await t.step("should validate npub prefix and length", async () => {
    // Mock bech32Decode with valid but wrong prefix
    const bech32DecodeStub = stub(
      await import("../../src/lib/utils.ts"),
      "bech32Decode",
      () => ({
        prefix: "nsec", // Wrong prefix
        data: new Uint8Array(32), // Correct length
      }),
    );

    try {
      const result = validateNpub("nsec1test");
      assertEquals(result, false);
    } finally {
      bech32DecodeStub.restore();
    }
  });

  await t.step("should validate npub data length", async () => {
    // Mock bech32Decode with correct prefix but wrong length
    const bech32DecodeStub = stub(
      await import("../../src/lib/utils.ts"),
      "bech32Decode",
      () => ({
        prefix: "npub", // Correct prefix
        data: new Uint8Array(16), // Wrong length (should be 32)
      }),
    );

    try {
      const result = validateNpub("npub1test");
      assertEquals(result, false);
    } finally {
      bech32DecodeStub.restore();
    }
  });

  await t.step("should accept valid npub", async () => {
    // Mock bech32Decode with valid npub
    const bech32DecodeStub = stub(
      await import("../../src/lib/utils.ts"),
      "bech32Decode",
      () => ({
        prefix: "npub", // Correct prefix
        data: new Uint8Array(32), // Correct length
      }),
    );

    try {
      const result = validateNpub("npub1test");
      assertEquals(result, true);
    } finally {
      bech32DecodeStub.restore();
    }
  });
});

Deno.test("Run Command - File Size Formatting Edge Cases", async (t) => {
  await t.step("should handle edge cases in file size formatting", () => {
    // Test boundary values
    assertEquals(formatFileSize(1023), "1023 B");
    assertEquals(formatFileSize(1025), "1 KB");
    assertEquals(formatFileSize(1048575), "1024 KB");
    assertEquals(formatFileSize(1048577), "1 MB");

    // Test very large numbers
    assertEquals(formatFileSize(1099511627776), "1 GB");

    // Test decimal precision
    assertEquals(formatFileSize(1536), "1.5 KB"); // 1.5 * 1024
    assertEquals(formatFileSize(2560), "2.5 KB"); // 2.5 * 1024
  });
});

Deno.test("Run Command - Configuration Options", async (t) => {
  await t.step("should handle default port configuration", async () => {
    // Test with missing port
    const resolveRelaysStub = stub(
      await import("../../src/lib/resolver-utils.ts"),
      "resolveRelays",
      () => ["wss://test.relay.com"],
    );

    const consoleLogStub = stub(console, "log");

    // Mock Deno.serve to resolve immediately
    const denoServeStub = stub(Deno, "serve", () =>
      ({
        finished: Promise.resolve(),
      }) as any);

    try {
      // Should use default port
      await runCommand({});

      assertEquals(denoServeStub.calls.length, 1);
      // Should use default port 8080
      assertEquals(denoServeStub.calls[0].args[0].port, 8080);
    } finally {
      resolveRelaysStub.restore();
      consoleLogStub.restore();
      denoServeStub.restore();
    }
  });

  await t.step("should handle custom port configuration", async () => {
    const resolveRelaysStub = stub(
      await import("../../src/lib/resolver-utils.ts"),
      "resolveRelays",
      () => ["wss://test.relay.com"],
    );

    const consoleLogStub = stub(console, "log");

    const denoServeStub = stub(Deno, "serve", () =>
      ({
        finished: Promise.resolve(),
      }) as any);

    try {
      await runCommand({ port: 3000 });

      assertEquals(denoServeStub.calls.length, 1);
      assertEquals(denoServeStub.calls[0].args[0].port, 3000);
    } finally {
      resolveRelaysStub.restore();
      consoleLogStub.restore();
      denoServeStub.restore();
    }
  });

  await t.step("should log startup information", async () => {
    const resolveRelaysStub = stub(
      await import("../../src/lib/resolver-utils.ts"),
      "resolveRelays",
      () => ["wss://test.relay.com", "wss://test2.relay.com"],
    );

    const consoleLogStub = stub(console, "log");

    const denoServeStub = stub(Deno, "serve", () =>
      ({
        finished: Promise.resolve(),
      }) as any);

    try {
      await runCommand({ port: 8080 });

      // Should have logged startup messages
      const logMessages = consoleLogStub.calls.map((call) => call.args[0]);

      const hasStartupMessage = logMessages.some((msg) =>
        typeof msg === "string" && msg.includes("Starting nsyte resolver server")
      );
      assertEquals(hasStartupMessage, true);

      const hasRelayMessage = logMessages.some((msg) =>
        typeof msg === "string" && msg.includes("Using relays:")
      );
      assertEquals(hasRelayMessage, true);

      const hasServerUrlMessage = logMessages.some((msg) =>
        typeof msg === "string" && msg.includes("Server URL:")
      );
      assertEquals(hasServerUrlMessage, true);
    } finally {
      resolveRelaysStub.restore();
      consoleLogStub.restore();
      denoServeStub.restore();
    }
  });
});

// Cleanup
Deno.test("Cleanup", () => {
  restore();
});
