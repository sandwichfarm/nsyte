import { assertEquals } from "@std/assert";
import { formatFindings, formatSummary } from "../../src/commands/scan.ts";
import type { ScanFinding, ScanResult } from "../../src/lib/scanner/mod.ts";

Deno.test("formatSummary", async (t) => {
  await t.step("shows correct counts for findings", () => {
    const result: ScanResult = {
      findings: [
        {
          filePath: "test.js",
          line: 1,
          patternId: "nsec-key",
          patternName: "Nostr Private Key",
          severity: "high",
          matchPreview: "nsec...",
        },
        {
          filePath: ".env",
          line: 3,
          patternId: "env-secret",
          patternName: "Env Secret",
          severity: "medium",
          matchPreview: "PRIV...",
        },
      ],
      filesScanned: 10,
      filesSkipped: 3,
      scanLevel: "medium",
      duration: 42,
    };

    const lines = formatSummary(result);
    const text = lines.join("\n");

    // Check that key numbers appear in output
    assertEquals(text.includes("10"), true); // filesScanned
    assertEquals(text.includes("3"), true); // filesSkipped
    assertEquals(text.includes("2"), true); // total findings
    assertEquals(text.includes("medium"), true); // scan level
    assertEquals(text.includes("42"), true); // duration
  });

  await t.step("shows zero findings for clean scan", () => {
    const result: ScanResult = {
      findings: [],
      filesScanned: 25,
      filesSkipped: 5,
      scanLevel: "medium",
      duration: 10,
    };

    const lines = formatSummary(result);
    const text = lines.join("\n");

    assertEquals(text.includes("25"), true);
    assertEquals(text.includes("0"), true);
  });
});

Deno.test("formatFindings", async (t) => {
  await t.step("sorts findings by severity (high first)", () => {
    const findings: ScanFinding[] = [
      {
        filePath: ".env",
        line: 1,
        patternId: "env-secret",
        patternName: "Env Secret",
        severity: "medium",
        matchPreview: "PRIV...",
      },
      {
        filePath: "test.js",
        line: 5,
        patternId: "nsec-key",
        patternName: "Nostr Private Key",
        severity: "high",
        matchPreview: "nsec...",
      },
    ];

    const lines = formatFindings(findings);
    const text = lines.join("\n");

    // High severity should appear before medium
    const highIdx = text.indexOf("HIGH");
    const medIdx = text.indexOf("MEDIUM");
    assertEquals(highIdx < medIdx, true);
  });

  await t.step("includes file path and line number", () => {
    const findings: ScanFinding[] = [
      {
        filePath: "src/config.js",
        line: 14,
        patternId: "nsec-key",
        patternName: "Nostr Private Key",
        severity: "high",
        matchPreview: "nsec...",
      },
    ];

    const lines = formatFindings(findings);
    const text = lines.join("\n");

    assertEquals(text.includes("src/config.js:14"), true);
    assertEquals(text.includes("nsec..."), true);
  });

  await t.step("handles filename-only findings (line 0)", () => {
    const findings: ScanFinding[] = [
      {
        filePath: ".env",
        line: 0,
        patternId: "dotenv-file",
        patternName: "Environment File",
        severity: "medium",
        matchPreview: ".env",
      },
    ];

    const lines = formatFindings(findings);
    const text = lines.join("\n");

    // Line 0 means filename match — should show filename without :0
    assertEquals(text.includes(".env"), true);
    assertEquals(text.includes(":0"), false);
  });

  await t.step("returns empty array for no findings", () => {
    const lines = formatFindings([]);
    assertEquals(lines.length, 0);
  });
});
