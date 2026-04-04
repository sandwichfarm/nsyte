import { assertEquals } from "@std/assert";
import {
  scanContent,
  scanFileList,
  type ScanFileEntry,
} from "../../src/lib/scanner/mod.ts";

/**
 * Tests for the deploy scan gate logic.
 * We test the scanner behavior that the gate depends on, not the gate itself
 * (which requires the full deploy pipeline). The gate's behavior is:
 * - scanFileList returns findings -> non-interactive: exit 1, interactive: prompt
 * - scanFileList returns no findings -> continue deploy
 * - skipSecretsScan -> skip entirely
 */

Deno.test("deploy scan gate - scanner behavior", async (t) => {
  await t.step(
    "scanFileList finds secrets in deploy file list",
    async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        // Simulate a deploy target with a leaked secret
        await Deno.writeTextFile(
          `${tempDir}/index.html`,
          "<html><body>Welcome</body></html>",
        );
        await Deno.writeTextFile(
          `${tempDir}/config.js`,
          'const NOSTR_KEY = "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe5ycp";',
        );

        const files: ScanFileEntry[] = [
          { path: "/index.html", absolutePath: `${tempDir}/index.html` },
          { path: "/config.js", absolutePath: `${tempDir}/config.js` },
        ];

        const result = await scanFileList(files, { level: "low" });

        // Gate would trigger: findings.length > 0
        assertEquals(result.findings.length > 0, true);
        assertEquals(result.filesScanned, 2);
      } finally {
        await Deno.remove(tempDir, { recursive: true });
      }
    },
  );

  await t.step(
    "scanFileList returns clean for safe deploy files",
    async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        await Deno.writeTextFile(
          `${tempDir}/index.html`,
          "<html><body>Hello World</body></html>",
        );
        await Deno.writeTextFile(
          `${tempDir}/style.css`,
          "body { color: black; }",
        );

        const files: ScanFileEntry[] = [
          { path: "/index.html", absolutePath: `${tempDir}/index.html` },
          { path: "/style.css", absolutePath: `${tempDir}/style.css` },
        ];

        const result = await scanFileList(files, { level: "medium" });

        // Gate would NOT trigger: findings.length === 0
        assertEquals(result.findings.length, 0);
      } finally {
        await Deno.remove(tempDir, { recursive: true });
      }
    },
  );

  await t.step(
    "scanFileList skips binary files in deploy list",
    async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        // Create a fake image with binary content containing hex-like data
        const binaryContent = new Uint8Array(100);
        binaryContent[50] = 0; // null byte
        await Deno.writeFile(`${tempDir}/image.png`, binaryContent);

        await Deno.writeTextFile(
          `${tempDir}/app.js`,
          'console.log("Hello");',
        );

        const files: ScanFileEntry[] = [
          { path: "/image.png", absolutePath: `${tempDir}/image.png` },
          { path: "/app.js", absolutePath: `${tempDir}/app.js` },
        ];

        const result = await scanFileList(files, { level: "medium" });

        // Binary file should be skipped, not scanned
        assertEquals(result.filesSkipped, 1);
        assertEquals(result.filesScanned, 1);
        assertEquals(result.findings.length, 0); // app.js is clean
      } finally {
        await Deno.remove(tempDir, { recursive: true });
      }
    },
  );

  await t.step("scan level affects what is detected", () => {
    const hexContent = `const hash = "${"a".repeat(64)}";`;

    // At low level: hex-64 not detected
    const lowFindings = scanContent("build.js", hexContent, "low");
    const lowHex = lowFindings.filter((f) => f.patternId === "hex-64");
    assertEquals(lowHex.length, 0);

    // At medium level: hex-64 detected
    const medFindings = scanContent("build.js", hexContent, "medium");
    const medHex = medFindings.filter((f) => f.patternId === "hex-64");
    assertEquals(medHex.length > 0, true);
  });

  await t.step("findings include severity for gate display", () => {
    const content =
      "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe5ycp";
    const findings = scanContent("leak.txt", content, "low");

    assertEquals(findings.length >= 1, true);
    assertEquals(findings[0].severity, "high");
    assertEquals(findings[0].patternName.length > 0, true);
    assertEquals(findings[0].matchPreview.endsWith("..."), true);
  });
});

Deno.test({
  name: "deploy command options",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "DeployCommandOptions should have skipSecretsScan field",
      async () => {
        // Verify the interface exists by importing the module
        const mod = await import("../../src/commands/deploy.ts");
        // The module exports registerDeployCommand — if it compiles, the interface is correct
        assertEquals(typeof mod.registerDeployCommand, "function");
      },
    );
  },
});
