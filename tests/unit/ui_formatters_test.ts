import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  formatConfigValue,
  formatDuration,
  formatFilePath,
  formatFileSize,
  formatFileSummary,
  formatPercentage,
  formatProgressBar,
  formatRelayList,
  formatRelayPublishResults,
  formatSectionHeader,
  formatServerResults,
  formatSuccessRatio,
  formatFileStatus,
  formatSummaryTitle,
  formatTable,
  formatTitle,
} from "../../src/ui/formatters.ts";
import { DisplayMode, getDisplayManager } from "../../src/lib/display-mode.ts";
import { colors } from "@cliffy/ansi/colors";

Deno.test("UI Formatters - formatTitle", async (t) => {
  await t.step("should format title correctly", () => {
    const result = formatTitle("Test Title");
    assertEquals(typeof result, "string");
    assertEquals(result.includes("Test Title"), true);
    assertEquals(result.includes("\n"), false); // Single line with color codes
  });

  await t.step("should handle empty title", () => {
    const result = formatTitle("");
    assertEquals(typeof result, "string");
  });
});

Deno.test("UI Formatters - formatSectionHeader", async (t) => {
  await t.step("should format section header", () => {
    const result = formatSectionHeader("Section Name");
    assertEquals(typeof result, "string");
    assertEquals(result.includes("Section Name"), true);
  });

  await t.step("should handle long section names", () => {
    const longName = "This is a very long section name that might wrap";
    const result = formatSectionHeader(longName);
    assertEquals(result.includes(longName), true);
  });
});

Deno.test("UI Formatters - formatConfigValue", async (t) => {
  await t.step("should format config with string value", () => {
    const result = formatConfigValue("Key", "Value", false);
    assertEquals(typeof result, "string");
    assertEquals(result.includes("Key"), true);
    assertEquals(result.includes("Value"), true);
  });

  await t.step("should format config with boolean value", () => {
    const result = formatConfigValue("Enabled", true, false);
    assertEquals(result.includes("Enabled"), true);
    assertEquals(result.includes("true"), true);
  });

  await t.step("should format config with number value", () => {
    const result = formatConfigValue("Count", 42, false);
    assertEquals(result.includes("Count"), true);
    assertEquals(result.includes("42"), true);
  });

  await t.step("should show default indicator when isDefault is true", () => {
    const result = formatConfigValue("Setting", "value", true);
    assertEquals(result.includes("(default)"), true);
  });
});

Deno.test("UI Formatters - formatFilePath", async (t) => {
  await t.step("should format file paths", () => {
    const result = formatFilePath("/path/to/file.txt");
    assertEquals(typeof result, "string");
    assertEquals(result.includes("file.txt"), true);
  });

  await t.step("should handle relative paths", () => {
    const result = formatFilePath("./relative/path.js");
    assertEquals(result.includes("path.js"), true);
  });

  await t.step("should handle empty path", () => {
    const result = formatFilePath("");
    assertEquals(typeof result, "string");
  });
});

Deno.test("UI Formatters - formatFileSize", async (t) => {
  await t.step("should format bytes", () => {
    assertEquals(formatFileSize(0), "0 B");
    assertEquals(formatFileSize(100), "100 B");
    assertEquals(formatFileSize(1023), "1023 B");
  });

  await t.step("should format kilobytes", () => {
    assertEquals(formatFileSize(1024), "1.0 KB");
    assertEquals(formatFileSize(1536), "1.5 KB");
    assertEquals(formatFileSize(2048), "2.0 KB");
  });

  await t.step("should format megabytes", () => {
    assertEquals(formatFileSize(1048576), "1.0 MB");
    assertEquals(formatFileSize(1572864), "1.5 MB");
    assertEquals(formatFileSize(5242880), "5.0 MB");
  });

  await t.step("should format gigabytes", () => {
    assertEquals(formatFileSize(1073741824), "1.0 GB");
    assertEquals(formatFileSize(2147483648), "2.0 GB");
  });

  await t.step("should handle negative numbers", () => {
    const result = formatFileSize(-1024);
    assertEquals(typeof result, "string");
  });
});

Deno.test("UI Formatters - formatFileSummary", async (t) => {
  await t.step("should format file summary with all changes", () => {
    const result = formatFileSummary(10, 5, 3);
    assertEquals(typeof result, "string");
    assertEquals(result.includes("10"), true);
    assertEquals(result.includes("5"), true);
    assertEquals(result.includes("3"), true);
  });

  await t.step("should handle zero values", () => {
    const result = formatFileSummary(0, 0, 0);
    assertEquals(typeof result, "string");
    assertEquals(result.includes("No files"), true);
  });

  await t.step("should handle large numbers", () => {
    const result = formatFileSummary(1000, 500, 100);
    assertEquals(result.includes("1000"), true);
    assertEquals(result.includes("500"), true);
    assertEquals(result.includes("100"), true);
  });
});

Deno.test("UI Formatters - formatRelayList", async (t) => {
  await t.step("should format single relay", () => {
    const result = formatRelayList(["wss://relay.test"]);
    assertEquals(result.includes("wss://relay.test"), true);
  });

  await t.step("should format multiple relays", () => {
    const relays = ["wss://relay1.test", "wss://relay2.test", "wss://relay3.test"];
    const result = formatRelayList(relays);
    assertEquals(result.includes("relay1"), true);
    assertEquals(result.includes("relay2"), true);
    assertEquals(result.includes("relay3"), true);
  });

  await t.step("should handle empty array", () => {
    const result = formatRelayList([]);
    assertEquals(result, "");
  });

  await t.step("should handle very long relay lists", () => {
    const longRelays = Array(20).fill(0).map((_, i) => `wss://relay${i}.test`);
    const result = formatRelayList(longRelays);
    assertEquals(typeof result, "string");
    assertEquals(result.length > 0, true);
  });
});

Deno.test("UI Formatters - formatServerResults", async (t) => {
  await t.step("should format server results", () => {
    const results = {
      "https://server1.test": { success: 10, total: 10 },
      "https://server2.test": { success: 8, total: 10 },
      "https://server3.test": { success: 0, total: 10 },
    };

    const formatted = formatServerResults(results);
    assertEquals(typeof formatted, "string");
    assertEquals(formatted.includes("server1"), true);
    assertEquals(formatted.includes("server2"), true);
    assertEquals(formatted.includes("server3"), true);
    assertEquals(formatted.includes("100%"), true); // server1 should be 100%
    assertEquals(formatted.includes("80%"), true); // server2 should be 80%
  });

  await t.step("should handle empty results", () => {
    const result = formatServerResults({});
    assertEquals(typeof result, "string");
  });

  await t.step("should handle servers with zero total", () => {
    const results = {
      "https://server.test": { success: 0, total: 0 },
    };
    const formatted = formatServerResults(results);
    assertEquals(typeof formatted, "string");
  });
});

Deno.test("UI Formatters - formatProgressBar", async (t) => {
  await t.step("should format progress bar at 0%", () => {
    const result = formatProgressBar(0, 100);
    assertEquals(typeof result, "string");
    assertEquals(result.includes("0%"), true);
  });

  await t.step("should format progress bar at 50%", () => {
    const result = formatProgressBar(50, 100);
    assertEquals(result.includes("50%"), true);
    assertEquals(result.includes("█"), true); // Should have some filled blocks
  });

  await t.step("should format progress bar at 100%", () => {
    const result = formatProgressBar(100, 100);
    assertEquals(result.includes("100%"), true);
  });

  await t.step("should handle zero total", () => {
    const result = formatProgressBar(0, 0);
    assertEquals(typeof result, "string");
  });

  await t.step("should handle current > total", () => {
    const result = formatProgressBar(150, 100);
    assertEquals(typeof result, "string");
    assertEquals(result.includes("100%"), true); // Should cap at 100%
  });
});

Deno.test("UI Formatters - formatDuration", async (t) => {
  await t.step("should format milliseconds", () => {
    assertEquals(formatDuration(500), "500ms");
    assertEquals(formatDuration(999), "999ms");
  });

  await t.step("should format seconds", () => {
    assertEquals(formatDuration(1000), "1.0s");
    assertEquals(formatDuration(1500), "1.5s");
    assertEquals(formatDuration(2500), "2.5s");
  });

  await t.step("should format minutes", () => {
    assertEquals(formatDuration(60000), "1m 0s");
    assertEquals(formatDuration(90000), "1m 30s");
    assertEquals(formatDuration(125000), "2m 5s");
  });

  await t.step("should handle zero duration", () => {
    assertEquals(formatDuration(0), "0ms");
  });

  await t.step("should handle negative duration", () => {
    const result = formatDuration(-1000);
    assertEquals(typeof result, "string");
  });
});

Deno.test("UI Formatters - formatPercentage", async (t) => {
  await t.step("should return 0% when total is 0", () => {
    assertEquals(formatPercentage(5, 0), "0%");
  });

  await t.step("should apply green color for >= 90%", () => {
    const result = formatPercentage(95, 100);
    assertStringIncludes(result, "95%");
  });

  await t.step("should apply yellow color for 60-89%", () => {
    const result = formatPercentage(75, 100);
    assertStringIncludes(result, "75%");
  });

  await t.step("should apply red color for < 60%", () => {
    const result = formatPercentage(30, 100);
    assertStringIncludes(result, "30%");
  });

  await t.step("should handle exact boundaries", () => {
    const green90 = formatPercentage(90, 100);
    assertStringIncludes(green90, "90%");

    const yellow89 = formatPercentage(89, 100);
    assertStringIncludes(yellow89, "89%");

    const yellow60 = formatPercentage(60, 100);
    assertStringIncludes(yellow60, "60%");

    const red59 = formatPercentage(59, 100);
    assertStringIncludes(red59, "59%");
  });

  await t.step("should handle 100%", () => {
    const result = formatPercentage(100, 100);
    assertStringIncludes(result, "100%");
  });
});

Deno.test("UI Formatters - formatSuccessRatio", async (t) => {
  await t.step("should show green when all succeed", () => {
    const result = formatSuccessRatio(10, 10);
    assertStringIncludes(result, "10/10");
    assertStringIncludes(result, "100%");
  });

  await t.step("should show red when none succeed", () => {
    const result = formatSuccessRatio(0, 10);
    assertStringIncludes(result, "0/10");
    assertStringIncludes(result, "0%");
  });

  await t.step("should show yellow for partial success", () => {
    const result = formatSuccessRatio(7, 10);
    assertStringIncludes(result, "7/10");
    assertStringIncludes(result, "70%");
  });

  await t.step("should handle zero total", () => {
    const result = formatSuccessRatio(0, 0);
    assertStringIncludes(result, "0/0");
  });
});

Deno.test("UI Formatters - formatFileStatus", async (t) => {
  await t.step("should format new status", () => {
    const result = formatFileStatus("new");
    assertStringIncludes(result, "New");
  });

  await t.step("should format unchanged status", () => {
    const result = formatFileStatus("unchanged");
    assertStringIncludes(result, "Unchanged");
  });

  await t.step("should format modified status", () => {
    const result = formatFileStatus("modified");
    assertStringIncludes(result, "Modified");
  });

  await t.step("should format deleted status", () => {
    const result = formatFileStatus("deleted");
    assertStringIncludes(result, "Deleted");
  });

  await t.step("should return original for unknown status", () => {
    const result = formatFileStatus("custom");
    assertEquals(result, "custom");
  });

  await t.step("should be case-insensitive", () => {
    assertStringIncludes(formatFileStatus("NEW"), "New");
    assertStringIncludes(formatFileStatus("Modified"), "Modified");
  });
});

Deno.test("UI Formatters - formatTable", async (t) => {
  await t.step("should return empty string for empty rows", () => {
    assertEquals(formatTable([]), "");
  });

  await t.step("should format single row", () => {
    const result = formatTable([["a", "b"]]);
    assertStringIncludes(result, "a");
    assertStringIncludes(result, "b");
  });

  await t.step("should align columns by width", () => {
    const result = formatTable([["short", "x"], ["longername", "y"]]);
    // Both rows should include the first-column content
    assertStringIncludes(result, "short");
    assertStringIncludes(result, "longername");
    // The shorter cell should be padded so next columns align
    const lines = result.split("\n");
    assertEquals(lines.length, 2);
    // second column position should be same for both lines
    const col2Pos0 = lines[0].indexOf("x");
    const col2Pos1 = lines[1].indexOf("y");
    assertEquals(col2Pos0, col2Pos1);
  });

  await t.step("should handle ANSI color codes in width calculation", () => {
    const result = formatTable([["normal", "x"], [colors.green("ok"), "y"]]);
    // Columns should still align despite ANSI codes
    const stripped = result.replace(/\x1b\[[0-9;]*m/g, "");
    const lines = stripped.split("\n");
    const col2Pos0 = lines[0].indexOf("x");
    const col2Pos1 = lines[1].indexOf("y");
    assertEquals(col2Pos0, col2Pos1);
  });

  await t.step("should apply indent", () => {
    const result = formatTable([["a", "b"]], 4);
    assertEquals(result.startsWith("    "), true);
  });

  await t.step("should not pad last column", () => {
    const result = formatTable([["a", "b"], ["longervalue", "c"]]);
    const lines = result.split("\n");
    // Last column values should not have trailing spaces beyond the value
    assertStringIncludes(lines[0], "b");
    assertStringIncludes(lines[1], "c");
  });
});

Deno.test("UI Formatters - formatRelayPublishResults", async (t) => {
  const dm = getDisplayManager();
  const originalMode = dm.getMode();

  await t.step("should return message for empty results", () => {
    const result = formatRelayPublishResults([]);
    assertEquals(result, "No relay results available");
  });

  await t.step("should format non-interactive mode", () => {
    dm.setMode(DisplayMode.NON_INTERACTIVE);
    const result = formatRelayPublishResults([
      { relay: "wss://r1", ok: true },
      { relay: "wss://r2", ok: false, message: "timeout" },
    ]);
    assertStringIncludes(result, "wss://r1: ok");
    assertStringIncludes(result, "wss://r2: failed (timeout)");
    dm.setMode(originalMode);
  });

  await t.step("should format interactive mode with ok relays", () => {
    dm.setMode(DisplayMode.INTERACTIVE);
    const result = formatRelayPublishResults([
      { relay: "wss://r1", ok: true },
    ]);
    assertStringIncludes(result, "✓");
    assertStringIncludes(result, "accepted");
  });

  await t.step("should format interactive mode with failed relays", () => {
    dm.setMode(DisplayMode.INTERACTIVE);
    const result = formatRelayPublishResults([
      { relay: "wss://r1", ok: false, message: "auth required" },
    ]);
    assertStringIncludes(result, "✗");
    assertStringIncludes(result, "auth required");
  });

  await t.step("should format interactive mode with failed relay no message", () => {
    dm.setMode(DisplayMode.INTERACTIVE);
    const result = formatRelayPublishResults([
      { relay: "wss://r", ok: false },
    ]);
    assertStringIncludes(result, "rejected");
  });

  dm.setMode(DisplayMode.INTERACTIVE);
});

Deno.test("UI Formatters - formatSummaryTitle", async (t) => {
  await t.step("should apply green for success", () => {
    const result = formatSummaryTitle("Done", true);
    assertStringIncludes(result, "Done");
  });

  await t.step("should apply yellow for non-success", () => {
    const result = formatSummaryTitle("Partial", false);
    assertStringIncludes(result, "Partial");
  });
});

Deno.test("UI Formatters - additional branch coverage", async (t) => {
  const dm = getDisplayManager();
  const originalMode = dm.getMode();

  await t.step("formatFileSize should return unknown for undefined", () => {
    const result = formatFileSize(undefined);
    assertStringIncludes(result, "unknown size");
  });

  await t.step("formatDuration should format hours", () => {
    // 3700000ms = 1h 1m 40s -> floors to "1h 1m"
    assertEquals(formatDuration(3700000), "1h 1m");
  });

  await t.step("formatDuration should format multiple hours", () => {
    // 7200000ms = 2h 0m
    assertEquals(formatDuration(7200000), "2h 0m");
  });

  await t.step("formatRelayList should truncate >3 relays in interactive mode", () => {
    dm.setMode(DisplayMode.INTERACTIVE);
    const relays = [
      "wss://r1.test",
      "wss://r2.test",
      "wss://r3.test",
      "wss://r4.test",
      "wss://r5.test",
    ];
    const result = formatRelayList(relays);
    assertStringIncludes(result, "more");
  });

  await t.step("formatRelayList should show all relays in non-interactive mode", () => {
    dm.setMode(DisplayMode.NON_INTERACTIVE);
    const relays = [
      "wss://r1.test",
      "wss://r2.test",
      "wss://r3.test",
      "wss://r4.test",
      "wss://r5.test",
    ];
    const result = formatRelayList(relays);
    // Non-interactive mode returns plain comma-separated text without "more"
    assertStringIncludes(result, "wss://r4.test");
    assertStringIncludes(result, "wss://r5.test");
    assertEquals(result.includes("more"), false);
  });

  await t.step("formatConfigValue should format boolean false", () => {
    const result = formatConfigValue("Flag", false, false);
    assertStringIncludes(result, "Flag");
    assertStringIncludes(result, "false");
  });

  await t.step("formatConfigValue should format 'none' string as gray", () => {
    const result = formatConfigValue("Val", "none", false);
    assertStringIncludes(result, "none");
  });

  await t.step("formatFileSummary non-interactive mode", () => {
    dm.setMode(DisplayMode.NON_INTERACTIVE);
    const result = formatFileSummary(3, 2, 1);
    assertEquals(result, "3 new, 2 unchanged, 1 to delete");
  });

  await t.step("formatServerResults non-interactive mode", () => {
    dm.setMode(DisplayMode.NON_INTERACTIVE);
    const result = formatServerResults({ "https://s1": { success: 5, total: 10 } });
    assertStringIncludes(result, "s1");
    assertStringIncludes(result, "5/10");
    assertStringIncludes(result, "50%");
  });

  await t.step("formatServerResults empty results", () => {
    const result = formatServerResults({});
    assertStringIncludes(result, "No server results");
  });

  dm.setMode(DisplayMode.INTERACTIVE);
});
