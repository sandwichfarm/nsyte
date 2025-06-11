import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Command } from "@cliffy/command";
import { restore, spy, stub } from "std/testing/mock.ts";
import { registerServeCommand, serveCommand } from "../../src/commands/serve.ts";

Deno.test("Serve Command - Registration", async (t) => {
  await t.step("should register serve command with options", () => {
    const program = new Command();
    registerServeCommand(program);

    const commands = program.getCommands();
    const serveCmd = commands.find((cmd) => cmd.getName() === "serve");

    assertExists(serveCmd);
    assertEquals(serveCmd.getName(), "serve");
    assertEquals(serveCmd.getDescription(), "Build and serve your local nsite files");

    // Check if options are registered
    const options = serveCmd.getOptions();
    const hasPortOption = options.some((opt) => opt.flags.includes("--port"));
    const hasDirOption = options.some((opt) => opt.flags.includes("--dir"));

    assertEquals(hasPortOption, true);
    assertEquals(hasDirOption, true);
  });
});

Deno.test("Serve Command - Success Cases", async (t) => {
  await t.step("should serve with default options", async () => {
    // Mock filesystem check
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    // Mock Deno.cwd
    const cwdStub = stub(Deno, "cwd", () => "/test/directory");

    // Mock console.log
    const consoleLogSpy = spy(console, "log");

    // Mock Deno.serve
    const mockServer = {
      finished: Promise.resolve(),
    };
    const serveStub = stub(Deno, "serve", () => mockServer);

    try {
      await serveCommand({});

      // Verify console output
      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasStartMessage = logCalls.some((log) => log.includes("Starting local nsite server"));
      const hasDirectoryMessage = logCalls.some((log) => log.includes("/test/directory/."));
      const hasUrlMessage = logCalls.some((log) => log.includes("http://localhost:8080"));

      assertEquals(hasStartMessage, true);
      assertEquals(hasDirectoryMessage, true);
      assertEquals(hasUrlMessage, true);

      // Verify server was started with correct port
      assertEquals(serveStub.calls.length, 1);
      assertEquals(serveStub.calls[0].args[0].port, 8080);
    } finally {
      restore();
    }
  });

  await t.step("should serve with custom port and directory", async () => {
    // Mock filesystem check
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    // Mock Deno.cwd
    const cwdStub = stub(Deno, "cwd", () => "/test/directory");

    // Mock console.log
    const consoleLogSpy = spy(console, "log");

    // Mock Deno.serve
    const mockServer = {
      finished: Promise.resolve(),
    };
    const serveStub = stub(Deno, "serve", () => mockServer);

    try {
      await serveCommand({ port: 3000, dir: "public" });

      // Verify console output with custom values
      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasDirectoryMessage = logCalls.some((log) => log.includes("/test/directory/public"));
      const hasUrlMessage = logCalls.some((log) => log.includes("http://localhost:3000"));

      assertEquals(hasDirectoryMessage, true);
      assertEquals(hasUrlMessage, true);

      // Verify server was started with custom port
      assertEquals(serveStub.calls.length, 1);
      assertEquals(serveStub.calls[0].args[0].port, 3000);
    } finally {
      restore();
    }
  });

  await t.step("should handle request routing", async () => {
    // Mock filesystem check
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    // Mock Deno.cwd
    const cwdStub = stub(Deno, "cwd", () => "/test");

    // Mock serveDir
    const mockResponse = new Response("test content");
    const serveDirStub = stub(
      await import("@std/http/file-server"),
      "serveDir",
      () => Promise.resolve(mockResponse),
    );

    // Mock Deno.serve to capture handler
    let capturedHandler: ((req: Request) => Promise<Response>) | null = null;
    const mockServer = {
      finished: Promise.resolve(),
    };
    const serveStub = stub(Deno, "serve", (options, handler) => {
      capturedHandler = handler;
      return mockServer;
    });

    try {
      const servePromise = serveCommand({ dir: "." });

      // Test the captured handler
      if (capturedHandler) {
        const testRequest = new Request("http://localhost:8080/test.html");
        const response = await capturedHandler(testRequest);

        assertEquals(response, mockResponse);

        // Verify serveDir was called with correct options
        assertEquals(serveDirStub.calls.length, 1);
        assertEquals(serveDirStub.calls[0].args[1].fsRoot, "/test/.");
        assertEquals(serveDirStub.calls[0].args[1].showDirListing, true);
        assertEquals(serveDirStub.calls[0].args[1].enableCors, true);
      }
    } finally {
      restore();
    }
  });
});

Deno.test("Serve Command - Error Cases", async (t) => {
  await t.step("should handle non-existent directory", async () => {
    // Mock filesystem check to return false
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => false,
    );

    // Mock Deno.cwd
    const cwdStub = stub(Deno, "cwd", () => "/test/directory");

    // Mock console.error
    const consoleErrorSpy = spy(console, "error");

    // Mock Deno.exit
    const exitStub = stub(Deno, "exit", () => {});

    try {
      await serveCommand({ dir: "nonexistent" });

      // Verify error message
      const errorCalls = consoleErrorSpy.calls.map((call) => call.args.join(" "));
      const hasErrorMessage = errorCalls.some((log) =>
        log.includes("Directory not found") && log.includes("/test/directory/nonexistent")
      );

      assertEquals(hasErrorMessage, true);

      // Verify exit(1) was called
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 1);
    } finally {
      restore();
    }
  });

  await t.step("should handle server startup errors", async () => {
    // Mock filesystem check
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    // Mock Deno.cwd
    const cwdStub = stub(Deno, "cwd", () => "/test");

    // Mock Deno.serve to throw error
    const serveStub = stub(Deno, "serve", () => {
      throw new Error("Port already in use");
    });

    // Mock handleError
    const handleErrorStub = stub(
      await import("../../src/lib/error-utils.ts"),
      "handleError",
      () => {},
    );

    try {
      await serveCommand({ port: 8080 });

      // Verify handleError was called
      assertEquals(handleErrorStub.calls.length, 1);
      assertEquals(handleErrorStub.calls[0].args[0], "Error starting server");
      assertEquals(handleErrorStub.calls[0].args[1].message, "Port already in use");
      assertEquals(handleErrorStub.calls[0].args[2].exit, true);
      assertEquals(handleErrorStub.calls[0].args[2].showConsole, true);
    } finally {
      restore();
    }
  });

  await t.step("should use fallback values for undefined options", async () => {
    // Mock filesystem check
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    // Mock Deno.cwd
    const cwdStub = stub(Deno, "cwd", () => "/test");

    // Mock Deno.serve
    const mockServer = {
      finished: Promise.resolve(),
    };
    const serveStub = stub(Deno, "serve", () => mockServer);

    try {
      // Pass undefined values to test fallbacks
      await serveCommand({ port: undefined, dir: undefined });

      // Verify default port 8080 was used
      assertEquals(serveStub.calls.length, 1);
      assertEquals(serveStub.calls[0].args[0].port, 8080);
    } finally {
      restore();
    }
  });
});
