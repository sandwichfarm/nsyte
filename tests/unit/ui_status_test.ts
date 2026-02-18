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
