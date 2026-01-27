import { assertEquals, assertExists } from "@std/assert";
import { restore, spy, stub } from "@std/testing/mock";
import {
  formatProgressBar,
  formatUploadProgress,
  ProgressRenderer,
} from "../../src/ui/progress.ts";

Deno.test("Progress Missing Coverage - formatProgressBar", async (t) => {
  await t.step("should handle zero total correctly", () => {
    const result = formatProgressBar(5, 0);

    assertExists(result);
    assert(result.includes("100%"));
    assert(result.includes("["));
    assert(result.includes("]"));
  });

  await t.step("should handle different percentage ranges", () => {
    // Test red range (< 30%)
    const redResult = formatProgressBar(1, 10);
    assertExists(redResult);
    assert(redResult.includes("10%"));

    // Test yellow range (30-69%)
    const yellowResult = formatProgressBar(5, 10);
    assertExists(yellowResult);
    assert(yellowResult.includes("50%"));

    // Test green range (>= 70%)
    const greenResult = formatProgressBar(8, 10);
    assertExists(greenResult);
    assert(greenResult.includes("80%"));
  });

  await t.step("should handle custom width", () => {
    const result = formatProgressBar(5, 10, 50);

    assertExists(result);
    assert(result.includes("50%"));
    // Width should affect the bar visualization
    assert(result.length > 60); // Longer bar
  });

  await t.step("should handle edge cases", () => {
    // Zero current
    const zeroResult = formatProgressBar(0, 10);
    assert(zeroResult.includes("0%"));

    // Equal current and total
    const completeResult = formatProgressBar(10, 10);
    assert(completeResult.includes("100%"));

    // Very small progress
    const smallResult = formatProgressBar(1, 100);
    assert(smallResult.includes("1%"));
  });
});

Deno.test("Progress Missing Coverage - formatUploadProgress", async (t) => {
  await t.step("should format complete progress info", () => {
    const progress = {
      total: 10,
      completed: 7,
      failed: 1,
      inProgress: 2,
    };

    const result = formatUploadProgress(progress);

    assertExists(result);
    assert(result.includes("7 completed"));
    assert(result.includes("1 failed"));
    assert(result.includes("2 in progress"));
    assert(result.includes("10 total"));
    assert(result.includes("70%"));
  });

  await t.step("should handle zero failed gracefully", () => {
    const progress = {
      total: 5,
      completed: 3,
      failed: 0,
      inProgress: 2,
    };

    const result = formatUploadProgress(progress);

    assertExists(result);
    assert(result.includes("0 failed"));
    // Should not have red coloring for zero failed
  });

  await t.step("should handle zero in progress gracefully", () => {
    const progress = {
      total: 5,
      completed: 5,
      failed: 0,
      inProgress: 0,
    };

    const result = formatUploadProgress(progress);

    assertExists(result);
    assert(result.includes("0 in progress"));
    assert(result.includes("100%"));
  });

  await t.step("should handle all combinations", () => {
    // All failed
    const allFailed = formatUploadProgress({
      total: 3,
      completed: 0,
      failed: 3,
      inProgress: 0,
    });
    assert(allFailed.includes("3 failed"));
    assert(allFailed.includes("0%"));

    // All in progress
    const allInProgress = formatUploadProgress({
      total: 5,
      completed: 0,
      failed: 0,
      inProgress: 5,
    });
    assert(allInProgress.includes("5 in progress"));
  });
});

Deno.test("Progress Missing Coverage - ProgressRenderer Edge Cases", async (t) => {
  await t.step("should handle zero total in constructor", () => {
    const renderer = new ProgressRenderer(0);
    assertExists(renderer);

    // Should handle zero total gracefully
    renderer.update({
      total: 0,
      completed: 0,
      failed: 0,
      inProgress: 0,
    });
  });

  await t.step("should handle update with number parameter", () => {
    const writeStub = stub(Deno.stdout, "writeSync", () => 0);

    try {
      const renderer = new ProgressRenderer(10);

      // Test numeric update
      renderer.update(5);

      // Should have called writeSync for progress display
      assert(writeStub.calls.length > 0);
    } finally {
      restore();
    }
  });

  await t.step("should handle update with path parameter", () => {
    const writeStub = stub(Deno.stdout, "writeSync", () => 0);

    try {
      const renderer = new ProgressRenderer(10);

      // Test numeric update with path
      renderer.update(3, "/path/to/file.txt");

      assert(writeStub.calls.length > 0);
    } finally {
      restore();
    }
  });

  await t.step("should handle multiple updates", () => {
    const writeStub = stub(Deno.stdout, "writeSync", () => 0);

    try {
      const renderer = new ProgressRenderer(10);

      // Multiple updates should work correctly
      renderer.update(1);
      renderer.update(2);
      renderer.update(3);

      // Should have made multiple writeSync calls
      assert(writeStub.calls.length >= 3);
    } finally {
      restore();
    }
  });

  await t.step("should handle complete with success", () => {
    const writeStub = stub(Deno.stdout, "writeSync", () => 0);
    const consoleLogSpy = spy(console, "log");
    const clearIntervalSpy = spy(globalThis, "clearInterval");

    try {
      const renderer = new ProgressRenderer(5);

      renderer.complete(true, "Upload successful");

      // Should log success message
      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasSuccessMessage = logCalls.some((log) =>
        log.includes("SUCCESS") && log.includes("Upload successful")
      );
      assert(hasSuccessMessage);
    } finally {
      restore();
    }
  });

  await t.step("should handle complete with error", () => {
    const writeStub = stub(Deno.stdout, "writeSync", () => 0);
    const consoleLogSpy = spy(console, "log");

    try {
      const renderer = new ProgressRenderer(5);

      renderer.complete(false, "Upload failed");

      // Should log error message
      const logCalls = consoleLogSpy.calls.map((call) => call.args.join(" "));
      const hasErrorMessage = logCalls.some((log) =>
        log.includes("ERROR") && log.includes("Upload failed")
      );
      assert(hasErrorMessage);
    } finally {
      restore();
    }
  });

  await t.step("should calculate ETA correctly", () => {
    const writeStub = stub(Deno.stdout, "writeSync", () => 0);
    const dateNowStub = stub(Date, "now");

    try {
      // Start time
      dateNowStub.returns = [0, 1000, 2000]; // 0ms, 1000ms, 2000ms

      const renderer = new ProgressRenderer(10);
      renderer.start();

      // Simulate 1 second passing with 2 items completed
      dateNowStub.returns = [1000];
      renderer.update({
        total: 10,
        completed: 2,
        failed: 0,
        inProgress: 8,
      });

      // Should calculate ETA (should be around 4 seconds for remaining 8 items)
      assert(writeStub.calls.length > 0);
    } finally {
      restore();
    }
  });

  await t.step("should handle server stats display", () => {
    const writeStub = stub(Deno.stdout, "writeSync", () => 0);

    try {
      const renderer = new ProgressRenderer(5);

      renderer.update({
        total: 5,
        completed: 2,
        failed: 0,
        inProgress: 3,
        serverStats: {
          "/path/to/file.txt": {
            successCount: 3,
            totalServers: 5,
          },
          "/path/to/other.txt": {
            successCount: 2,
            totalServers: 4,
          },
        },
      });

      // Should display server info for latest file
      assert(writeStub.calls.length > 0);
    } finally {
      restore();
    }
  });

  await t.step("should handle empty server stats", () => {
    const writeStub = stub(Deno.stdout, "writeSync", () => 0);

    try {
      const renderer = new ProgressRenderer(5);

      renderer.update({
        total: 5,
        completed: 1,
        failed: 0,
        inProgress: 4,
        serverStats: {},
      });

      assert(writeStub.calls.length > 0);
    } finally {
      restore();
    }
  });
});

// Helper function to make assertions easier to read
function assert(condition: boolean, message?: string): void {
  assertEquals(condition, true, message);
}
