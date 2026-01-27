import { assertEquals } from "@std/assert";
import {
  formatConfigValue,
  formatDuration,
  formatFilePath,
  formatFileSize,
  formatFileSummary,
  formatProgressBar,
  formatRelayList,
  formatSectionHeader,
  formatServerResults,
  formatTitle,
} from "../../src/ui/formatters.ts";

Deno.test("UI Formatters - formatTitle", async (t) => {
  await t.step("should format title correctly", () => {
    const result = formatTitle("Test Title");
    assertEquals(typeof result, "string");
    assertEquals(result.includes("Test Title"), true);
    assertEquals(result.includes("\n"), true); // Should have newlines
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
    assertEquals(result.includes("relative/path.js"), true);
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
    assertEquals(result.includes("0"), true);
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
    assertEquals(result, "wss://relay.test");
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
