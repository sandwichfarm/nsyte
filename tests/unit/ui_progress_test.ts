import { assertEquals } from "std/assert/mod.ts";
import { stub } from "std/testing/mock.ts";
import { ProgressRenderer } from "../../src/ui/progress.ts";

Deno.test("UI Progress - ProgressRenderer", async (t) => {
  let consoleLogStub: any;
  let setIntervalStub: any;
  let clearIntervalStub: any;

  await t.step("should initialize with total files", () => {
    const progress = new ProgressRenderer(10);
    assertEquals(progress instanceof ProgressRenderer, true);
  });

  await t.step("should start progress rendering", () => {
    consoleLogStub = stub(console, "log", () => {});
    const mockIntervalId = 123;
    setIntervalStub = stub(globalThis, "setInterval", () => mockIntervalId);
    
    const progress = new ProgressRenderer(5);
    progress.start();
    
    // Should set up interval
    assertEquals(setIntervalStub.calls.length, 1);
    
    setIntervalStub.restore();
    consoleLogStub.restore();
  });

  await t.step("should update progress", () => {
    consoleLogStub = stub(console, "log", () => {});
    
    const progress = new ProgressRenderer(10);
    
    // Update with different progress values
    progress.update({
      total: 10,
      completed: 0,
      failed: 0,
      inProgress: 10,
      serverStats: {
        "file1.txt": { successCount: 0, totalServers: 1 }
      }
    });
    
    progress.update({
      total: 10,
      completed: 5,
      failed: 0,
      inProgress: 5,
      serverStats: {
        "file2.txt": { successCount: 1, totalServers: 2 }
      }
    });
    
    progress.update({
      total: 10,
      completed: 10,
      failed: 0,
      inProgress: 0,
      serverStats: {
        "file3.txt": { successCount: 2, totalServers: 2 }
      }
    });
    
    consoleLogStub.restore();
  });

  await t.step("should handle server errors in progress", () => {
    consoleLogStub = stub(console, "log", () => {});
    
    const progress = new ProgressRenderer(5);
    
    progress.update({
      total: 5,
      completed: 1,
      failed: 1,
      inProgress: 3,
      serverStats: {
        "error-file.txt": { successCount: 1, totalServers: 2 }
      }
    });
    
    consoleLogStub.restore();
  });

  await t.step("should stop progress rendering", () => {
    consoleLogStub = stub(console, "log", () => {});
    clearIntervalStub = stub(globalThis, "clearInterval", () => {});
    const mockIntervalId = 456;
    setIntervalStub = stub(globalThis, "setInterval", () => mockIntervalId);
    
    const progress = new ProgressRenderer(5);
    progress.start();
    progress.stop();
    
    // Should clear interval
    assertEquals(clearIntervalStub.calls.length, 1);
    assertEquals(clearIntervalStub.calls[0].args[0], mockIntervalId);
    
    clearIntervalStub.restore();
    setIntervalStub.restore();
    consoleLogStub.restore();
  });

  await t.step("should complete with success message", () => {
    consoleLogStub = stub(console, "log", () => {});
    
    const progress = new ProgressRenderer(10);
    progress.complete(true, "All files uploaded successfully!");
    
    // Should log completion message
    assertEquals(consoleLogStub.calls.length > 0, true);
    const loggedContent = consoleLogStub.calls.map((call: any) => call.args.join(" ")).join("\n");
    assertEquals(loggedContent.includes("All files uploaded"), true);
    
    consoleLogStub.restore();
  });

  await t.step("should complete with error message", () => {
    consoleLogStub = stub(console, "log", () => {});
    
    const progress = new ProgressRenderer(10);
    progress.complete(false, "Upload failed with errors");
    
    // Should log error message
    assertEquals(consoleLogStub.calls.length > 0, true);
    const loggedContent = consoleLogStub.calls.map((call: any) => call.args.join(" ")).join("\n");
    assertEquals(loggedContent.includes("Upload failed"), true);
    
    consoleLogStub.restore();
  });

  await t.step("should handle empty server progress", () => {
    consoleLogStub = stub(console, "log", () => {});
    
    const progress = new ProgressRenderer(3);
    
    progress.update({
      total: 3,
      completed: 1,
      failed: 0,
      inProgress: 2
    });
    
    consoleLogStub.restore();
  });

  await t.step("should handle zero total files", () => {
    consoleLogStub = stub(console, "log", () => {});
    
    const progress = new ProgressRenderer(0);
    
    progress.update({
      total: 0,
      completed: 0,
      failed: 0,
      inProgress: 0
    });
    
    consoleLogStub.restore();
  });

  await t.step("should handle progress exceeding total", () => {
    consoleLogStub = stub(console, "log", () => {});
    
    const progress = new ProgressRenderer(5);
    
    // Update with more files than total
    progress.update({
      total: 5,
      completed: 10,
      failed: 0,
      inProgress: 0,
      serverStats: {
        "extra-file.txt": { successCount: 1, totalServers: 1 }
      }
    });
    
    consoleLogStub.restore();
  });
});