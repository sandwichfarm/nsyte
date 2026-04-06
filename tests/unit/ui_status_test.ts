import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import { DisplayMode, getDisplayManager } from "../../src/lib/display-mode.ts";
import { StatusDisplay } from "../../src/ui/status.ts";

Deno.test("UI Status - StatusDisplay", async (t) => {
  let consoleLogStub: any;

  // Force non-interactive mode so StatusDisplay uses console.log instead of Deno.stdout.writeSync
  const manager = getDisplayManager();
  const originalMode = manager.getMode();
  manager.setMode(DisplayMode.NON_INTERACTIVE);

  await t.step("should create status display instance", () => {
    const status = new StatusDisplay();
    assertEquals(status instanceof StatusDisplay, true);
  });

  await t.step("should update status message", () => {
    consoleLogStub = stub(console, "log", () => {});

    const status = new StatusDisplay();
    status.update("Processing files...");

    // Should log the update message
    assertEquals(consoleLogStub.calls.length, 1);
    const loggedMessage = consoleLogStub.calls[0].args.join(" ");
    assertEquals(loggedMessage.includes("Processing files"), true);

    consoleLogStub.restore();
  });

  await t.step("should show success message", () => {
    consoleLogStub = stub(console, "log", () => {});

    const status = new StatusDisplay();
    status.success("Operation completed successfully!");

    // Should log success message
    assertEquals(consoleLogStub.calls.length, 1);
    const loggedMessage = consoleLogStub.calls[0].args.join(" ");
    assertEquals(loggedMessage.includes("Operation completed"), true);
    // Should include success indicator (checkmark)
    assertEquals(loggedMessage.includes("✓"), true);

    consoleLogStub.restore();
  });

  await t.step("should show error message", () => {
    consoleLogStub = stub(console, "log", () => {});

    const status = new StatusDisplay();
    status.error("Failed to connect to server");

    // Should log error message
    assertEquals(consoleLogStub.calls.length, 1);
    const loggedMessage = consoleLogStub.calls[0].args.join(" ");
    assertEquals(loggedMessage.includes("Failed to connect"), true);
    // Should include error indicator (X)
    assertEquals(loggedMessage.includes("✗"), true);

    consoleLogStub.restore();
  });

  await t.step("should handle empty messages", () => {
    consoleLogStub = stub(console, "log", () => {});

    const status = new StatusDisplay();

    status.update("");
    status.success("");
    status.error("");

    // update("") and success("") log, but error("") triggers early return in complete()
    // because !success && !message evaluates to true (empty string is falsy)
    assertEquals(consoleLogStub.calls.length, 2);

    consoleLogStub.restore();
  });

  await t.step("should handle very long messages", () => {
    consoleLogStub = stub(console, "log", () => {});

    const status = new StatusDisplay();
    const longMessage = "This is a very long status message that might wrap on narrow terminals "
      .repeat(5);

    status.update(longMessage);

    assertEquals(consoleLogStub.calls.length, 1);
    const loggedMessage = consoleLogStub.calls[0].args.join(" ");
    assertEquals(loggedMessage.includes("This is a very long"), true);

    consoleLogStub.restore();
  });

  await t.step("should handle special characters", () => {
    consoleLogStub = stub(console, "log", () => {});

    const status = new StatusDisplay();

    status.update("Processing: <file> with special chars & symbols!");
    status.success("Uploaded: 文件.txt successfully 🎉");
    status.error("Failed: connection@server:port");

    assertEquals(consoleLogStub.calls.length, 3);

    consoleLogStub.restore();
  });

  await t.step("should handle sequential updates", () => {
    consoleLogStub = stub(console, "log", () => {});

    const status = new StatusDisplay();

    // Simulate progress through different states
    status.update("Initializing...");
    status.update("Connecting to server...");
    status.update("Uploading file 1/10...");
    status.update("Uploading file 5/10...");
    status.update("Uploading file 10/10...");
    status.success("All files uploaded!");

    assertEquals(consoleLogStub.calls.length, 6);

    // Check that messages are logged in order
    const messages = consoleLogStub.calls.map((call: any) => call.args.join(" "));
    assertEquals(messages[0].includes("Initializing"), true);
    assertEquals(messages[5].includes("All files uploaded"), true);

    consoleLogStub.restore();
  });

  await t.step("should handle error recovery flow", () => {
    consoleLogStub = stub(console, "log", () => {});

    const status = new StatusDisplay();

    // Simulate error and retry
    status.update("Attempting to connect...");
    status.error("Connection failed");
    status.update("Retrying connection...");
    status.success("Connected successfully");

    assertEquals(consoleLogStub.calls.length, 4);

    const messages = consoleLogStub.calls.map((call: any) => call.args.join(" "));
    assertEquals(messages[1].includes("✗"), true); // Error
    assertEquals(messages[3].includes("✓"), true); // Success

    consoleLogStub.restore();
  });

  // Restore original display mode
  manager.setMode(originalMode);
});

Deno.test("UI Status - StatusDisplay interactive mode", async (t) => {
  // Force interactive mode so StatusDisplay uses Deno.stdout.writeSync
  const manager = getDisplayManager();
  const originalMode = manager.getMode();
  manager.setMode(DisplayMode.INTERACTIVE);

  await t.step("update() interactive branch calls writeSync with clear + message", () => {
    const writeSyncCalls: Uint8Array[] = [];
    const writeSyncStub = stub(Deno.stdout, "writeSync", (data: Uint8Array) => {
      writeSyncCalls.push(data);
      return data.length;
    });

    try {
      const status = new StatusDisplay();
      status.update("hello");

      // Should call writeSync twice: clear escape + message
      assertEquals(writeSyncCalls.length, 2);
      const clearSeq = new TextDecoder().decode(writeSyncCalls[0]);
      assertEquals(clearSeq.includes("\r"), true);
      const msgSeq = new TextDecoder().decode(writeSyncCalls[1]);
      assertEquals(msgSeq, "hello");
    } finally {
      writeSyncStub.restore();
    }
  });

  await t.step("clear() interactive branch calls writeSync and resets message", () => {
    const writeSyncCalls: Uint8Array[] = [];
    const writeSyncStub = stub(Deno.stdout, "writeSync", (data: Uint8Array) => {
      writeSyncCalls.push(data);
      return data.length;
    });

    try {
      const status = new StatusDisplay();
      status.clear();

      // Should call writeSync once for clearing the line
      assertEquals(writeSyncCalls.length >= 1, true);
      const clearSeq = new TextDecoder().decode(writeSyncCalls[0]);
      assertEquals(clearSeq.includes("\r"), true);
    } finally {
      writeSyncStub.restore();
    }
  });

  await t.step("complete() no-args branch just clears without logging", () => {
    const writeSyncCalls: Uint8Array[] = [];
    const writeSyncStub = stub(Deno.stdout, "writeSync", (data: Uint8Array) => {
      writeSyncCalls.push(data);
      return data.length;
    });
    const consoleLogCalls: unknown[][] = [];
    const consoleLogStub = stub(console, "log", (...args: unknown[]) => {
      consoleLogCalls.push(args);
    });

    try {
      const status = new StatusDisplay();
      status.complete(undefined, undefined);

      // Should NOT log anything, just writeSync for clear
      assertEquals(consoleLogCalls.length, 0);
      // writeSync called for clear
      assertEquals(writeSyncCalls.length >= 1, true);
    } finally {
      writeSyncStub.restore();
      consoleLogStub.restore();
    }
  });

  await t.step("complete() interactive success branch calls writeSync + logs checkmark", () => {
    const writeSyncCalls: Uint8Array[] = [];
    const writeSyncStub = stub(Deno.stdout, "writeSync", (data: Uint8Array) => {
      writeSyncCalls.push(data);
      return data.length;
    });
    const consoleLogCalls: unknown[][] = [];
    const consoleLogStub = stub(console, "log", (...args: unknown[]) => {
      consoleLogCalls.push(args);
    });

    try {
      const status = new StatusDisplay();
      status.complete(true, "done");

      // Should call writeSync to clear line
      assertEquals(writeSyncCalls.length >= 1, true);
      // Should log with checkmark
      assertEquals(consoleLogCalls.length, 1);
      const loggedMsg = consoleLogCalls[0].join(" ");
      assertEquals(loggedMsg.includes("✓"), true);
      assertEquals(loggedMsg.includes("done"), true);
    } finally {
      writeSyncStub.restore();
      consoleLogStub.restore();
    }
  });

  await t.step("complete() interactive error branch calls writeSync + logs X mark", () => {
    const writeSyncCalls: Uint8Array[] = [];
    const writeSyncStub = stub(Deno.stdout, "writeSync", (data: Uint8Array) => {
      writeSyncCalls.push(data);
      return data.length;
    });
    const consoleLogCalls: unknown[][] = [];
    const consoleLogStub = stub(console, "log", (...args: unknown[]) => {
      consoleLogCalls.push(args);
    });

    try {
      const status = new StatusDisplay();
      status.complete(false, "failed");

      // Should call writeSync to clear line
      assertEquals(writeSyncCalls.length >= 1, true);
      // Should log with X mark
      assertEquals(consoleLogCalls.length, 1);
      const loggedMsg = consoleLogCalls[0].join(" ");
      assertEquals(loggedMsg.includes("✗"), true);
      assertEquals(loggedMsg.includes("failed"), true);
    } finally {
      writeSyncStub.restore();
      consoleLogStub.restore();
    }
  });

  await t.step("addMessage() interactive branch with currentMessage reprints status", () => {
    const writeSyncCalls: Uint8Array[] = [];
    const writeSyncStub = stub(Deno.stdout, "writeSync", (data: Uint8Array) => {
      writeSyncCalls.push(data);
      return data.length;
    });
    const consoleLogCalls: unknown[][] = [];
    const consoleLogStub = stub(console, "log", (...args: unknown[]) => {
      consoleLogCalls.push(args);
    });

    try {
      const status = new StatusDisplay();
      // Set currentMessage via update()
      status.update("current status");
      // Reset call counts for addMessage check
      writeSyncCalls.length = 0;

      status.addMessage("info message");

      // Should call writeSync: once to clear line, once to reprint currentMessage
      assertEquals(writeSyncCalls.length, 2);
      const clearSeq = new TextDecoder().decode(writeSyncCalls[0]);
      assertEquals(clearSeq.includes("\r"), true);
      const reprintSeq = new TextDecoder().decode(writeSyncCalls[1]);
      assertEquals(reprintSeq, "current status");
      // Should console.log the info message
      assertEquals(consoleLogCalls.length, 1);
      const loggedMsg = consoleLogCalls[0].join(" ");
      assertEquals(loggedMsg.includes("info message"), true);
    } finally {
      writeSyncStub.restore();
      consoleLogStub.restore();
    }
  });

  await t.step("addMessage() interactive branch without currentMessage skips reprint", () => {
    const writeSyncCalls: Uint8Array[] = [];
    const writeSyncStub = stub(Deno.stdout, "writeSync", (data: Uint8Array) => {
      writeSyncCalls.push(data);
      return data.length;
    });
    const consoleLogCalls: unknown[][] = [];
    const consoleLogStub = stub(console, "log", (...args: unknown[]) => {
      consoleLogCalls.push(args);
    });

    try {
      // Fresh instance with no prior update() call
      const status = new StatusDisplay();
      status.addMessage("standalone info");

      // Should call writeSync only once (clear line), no reprint
      assertEquals(writeSyncCalls.length, 1);
      const clearSeq = new TextDecoder().decode(writeSyncCalls[0]);
      assertEquals(clearSeq.includes("\r"), true);
      // Should console.log the message
      assertEquals(consoleLogCalls.length, 1);
      const loggedMsg = consoleLogCalls[0].join(" ");
      assertEquals(loggedMsg.includes("standalone info"), true);
    } finally {
      writeSyncStub.restore();
      consoleLogStub.restore();
    }
  });

  // Restore original display mode
  manager.setMode(originalMode);
});
