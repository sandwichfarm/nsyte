import { assertEquals, assertExists } from "std/assert/mod.ts";
import { restore, spy, stub } from "std/testing/mock.ts";
import { serveCommand } from "../../src/commands/serve.ts";

Deno.test("Serve Command - Enhanced Functionality", async (t) => {
  await t.step("should handle valid directory with default options", async () => {
    // Mock filesystem check to return true
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    // Mock Deno.cwd
    const cwdStub = stub(Deno, "cwd", () => "/test/directory");

    // Mock console.log to capture output
    const consoleLogSpy = spy(console, "log");

    // Mock Deno.serve to avoid actually starting a server
    const mockServer = {
      finished: Promise.resolve(),
    };
    const serveStub = stub(Deno, "serve", () => mockServer);

    try {
      await serveCommand({});

      // Verify startup messages were logged
      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasStartMessage = logCalls.some((log) => log.includes("Starting local nsite server"));
      const hasDirectoryMessage = logCalls.some((log) => log.includes("/test/directory/."));
      const hasUrlMessage = logCalls.some((log) => log.includes("http://localhost:8080"));
      const hasStopMessage = logCalls.some((log) => log.includes("Press Ctrl+C"));

      assertEquals(hasStartMessage, true);
      assertEquals(hasDirectoryMessage, true);
      assertEquals(hasUrlMessage, true);
      assertEquals(hasStopMessage, true);

      // Verify server was started with correct configuration
      assertEquals(serveStub.calls.length, 1);
      assertEquals(serveStub.calls[0].args[0].port, 8080);
      assertExists(serveStub.calls[0].args[1]); // Handler function
    } finally {
      restore();
    }
  });

  await t.step("should handle custom port and directory", async () => {
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    const cwdStub = stub(Deno, "cwd", () => "/custom/path");
    const consoleLogSpy = spy(console, "log");

    const mockServer = {
      finished: Promise.resolve(),
    };
    const serveStub = stub(Deno, "serve", () => mockServer);

    try {
      await serveCommand({ port: 3000, dir: "public" });

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasCustomDirectory = logCalls.some((log) => log.includes("/custom/path/public"));
      const hasCustomPort = logCalls.some((log) => log.includes("http://localhost:3000"));

      assertEquals(hasCustomDirectory, true);
      assertEquals(hasCustomPort, true);
      assertEquals(serveStub.calls[0].args[0].port, 3000);
    } finally {
      restore();
    }
  });

  await t.step("should handle non-existent directory", async () => {
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => false,
    );

    const cwdStub = stub(Deno, "cwd", () => "/test");
    const consoleErrorSpy = spy(console, "error");
    const exitStub = stub(Deno, "exit", () => {});

    try {
      await serveCommand({ dir: "nonexistent" });

      // Should log error message
      const errorCalls = consoleErrorSpy.calls.map((call) => call.args.join(" "));
      const hasErrorMessage = errorCalls.some((log) =>
        log.includes("Directory not found") && log.includes("/test/nonexistent")
      );

      assertEquals(hasErrorMessage, true);
      assertEquals(exitStub.calls.length, 1);
      assertEquals(exitStub.calls[0].args[0], 1);
    } finally {
      restore();
    }
  });

  await t.step("should handle server errors gracefully", async () => {
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    const cwdStub = stub(Deno, "cwd", () => "/test");

    // Mock Deno.serve to throw an error
    const serveStub = stub(Deno, "serve", () => {
      throw new Error("Address already in use");
    });

    // Mock handleError function
    const handleErrorStub = stub(
      await import("../../src/lib/error-utils.ts"),
      "handleError",
      () => {},
    );

    try {
      await serveCommand({ port: 8080 });

      // Verify handleError was called with correct parameters
      assertEquals(handleErrorStub.calls.length, 1);
      assertEquals(handleErrorStub.calls[0].args[0], "Error starting server");
      assertEquals(handleErrorStub.calls[0].args[1].message, "Address already in use");
      assertEquals(handleErrorStub.calls[0].args[2].exit, true);
      assertEquals(handleErrorStub.calls[0].args[2].showConsole, true);
      assertExists(handleErrorStub.calls[0].args[2].logger);
    } finally {
      restore();
    }
  });

  await t.step("should create proper request handler", async () => {
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    const cwdStub = stub(Deno, "cwd", () => "/test/path");

    // Mock serveDir function
    const mockResponse = new Response("test content");
    const serveDirStub = stub(
      await import("@std/http/file-server"),
      "serveDir",
      () => Promise.resolve(mockResponse),
    );

    // Capture the handler function
    let capturedHandler: ((req: Request) => Promise<Response>) | null = null;
    const mockServer = {
      finished: Promise.resolve(),
    };
    const serveStub = stub(Deno, "serve", (options, handler) => {
      capturedHandler = handler;
      return mockServer;
    });

    try {
      const servePromise = serveCommand({ dir: "docs" });

      // Test the captured handler
      if (capturedHandler) {
        const testRequest = new Request("http://localhost:8080/index.html");
        const response = await capturedHandler(testRequest);

        assertEquals(response, mockResponse);

        // Verify serveDir was called with correct options
        assertEquals(serveDirStub.calls.length, 1);
        assertEquals(serveDirStub.calls[0].args[0], testRequest);
        assertEquals(serveDirStub.calls[0].args[1].fsRoot, "/test/path/docs");
        assertEquals(serveDirStub.calls[0].args[1].showDirListing, true);
        assertEquals(serveDirStub.calls[0].args[1].enableCors, true);
      }
    } finally {
      restore();
    }
  });

  await t.step("should use fallback values for undefined options", async () => {
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    const cwdStub = stub(Deno, "cwd", () => "/fallback/test");
    const consoleLogSpy = spy(console, "log");

    const mockServer = {
      finished: Promise.resolve(),
    };
    const serveStub = stub(Deno, "serve", () => mockServer);

    try {
      // Test with explicitly undefined values
      await serveCommand({ port: undefined, dir: undefined });

      // Should use defaults: port 8080, dir "."
      assertEquals(serveStub.calls[0].args[0].port, 8080);

      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasDefaultDir = logCalls.some((log) => log.includes("/fallback/test/."));
      const hasDefaultPort = logCalls.some((log) => log.includes("localhost:8080"));

      assertEquals(hasDefaultDir, true);
      assertEquals(hasDefaultPort, true);
    } finally {
      restore();
    }
  });

  await t.step("should handle absolute directory path correctly", async () => {
    const existsSyncStub = stub(
      await import("@std/fs/exists"),
      "existsSync",
      () => true,
    );

    const cwdStub = stub(Deno, "cwd", () => "/base/path");

    // Mock join function to verify path handling
    const joinStub = stub(
      await import("@std/path"),
      "join",
      (base, relative) => `${base}/${relative}`,
    );

    const mockServer = {
      finished: Promise.resolve(),
    };
    const serveStub = stub(Deno, "serve", () => mockServer);

    try {
      await serveCommand({ dir: "assets" });

      // Verify join was called to create absolute path
      assertEquals(joinStub.calls.length, 1);
      assertEquals(joinStub.calls[0].args[0], "/base/path");
      assertEquals(joinStub.calls[0].args[1], "assets");

      // Verify existsSync was called with the joined path
      assertEquals(existsSyncStub.calls[0].args[0], "/base/path/assets");
    } finally {
      restore();
    }
  });
});
