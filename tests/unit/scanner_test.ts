import { assertEquals, assertExists } from "@std/assert";
import {
  createMatchPreview,
  scanContent,
  scanDirectory,
  scanFileList,
  shannonEntropy,
} from "../../src/lib/scanner/mod.ts";
import type { ScanFileEntry } from "../../src/lib/scanner/mod.ts";

Deno.test("createMatchPreview", async (t) => {
  await t.step("truncates long strings to 4 chars + ...", () => {
    assertEquals(createMatchPreview("nsec1abcdefghijklmnop"), "nsec...");
  });

  await t.step("truncates short strings to 2 chars + ...", () => {
    assertEquals(createMatchPreview("abc"), "ab...");
  });

  await t.step("never returns more than 7 characters", () => {
    const result = createMatchPreview("a".repeat(100));
    assertEquals(result.length <= 7, true);
  });
});

Deno.test("shannonEntropy", async (t) => {
  await t.step("returns 0 for empty string", () => {
    assertEquals(shannonEntropy(""), 0);
  });

  await t.step("returns 0 for single-character string", () => {
    assertEquals(shannonEntropy("aaaa"), 0);
  });

  await t.step("returns 1.0 for two equally frequent characters", () => {
    const entropy = shannonEntropy("abab");
    assertEquals(Math.abs(entropy - 1.0) < 0.01, true);
  });

  await t.step("returns high entropy for random-looking string", () => {
    const entropy = shannonEntropy("aB3$xZ9@kL5#mN7&pQ2!");
    assertEquals(entropy > 4.0, true);
  });

  await t.step("returns low entropy for repeated pattern", () => {
    const entropy = shannonEntropy("abcabcabcabcabcabc");
    assertEquals(entropy < 2.0, true);
  });
});

Deno.test("scanContent", async (t) => {
  await t.step("detects nsec key in file content", () => {
    const content =
      'const key = "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe5ycp";';
    const findings = scanContent("test.js", content, "low");
    assertEquals(findings.length >= 1, true);
    assertEquals(findings[0].patternId, "nsec-key");
    assertEquals(findings[0].severity, "high");
    assertEquals(findings[0].line, 1);
  });

  await t.step("detects nbunksec in file content", () => {
    const content = "nbunksec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    const findings = scanContent("test.js", content, "low");
    const nbunkFindings = findings.filter((f) => f.patternId === "nbunksec");
    assertEquals(nbunkFindings.length >= 1, true);
  });

  await t.step("detects bunker URL in file content", () => {
    const content =
      "const url = 'bunker://abc123?relay=wss://relay.example.com&secret=xyz'";
    const findings = scanContent("test.js", content, "low");
    const bunkerFindings = findings.filter(
      (f) => f.patternId === "bunker-url",
    );
    assertEquals(bunkerFindings.length >= 1, true);
  });

  await t.step("detects hex-64 at medium level", () => {
    const hex64 = "a".repeat(64);
    const content = `const pubkey = "${hex64}";`;
    const findings = scanContent("test.js", content, "medium");
    const hexFindings = findings.filter((f) => f.patternId === "hex-64");
    assertEquals(hexFindings.length >= 1, true);
  });

  await t.step("does not detect hex-64 at low level", () => {
    const hex64 = "a".repeat(64);
    const content = `const pubkey = "${hex64}";`;
    const findings = scanContent("test.js", content, "low");
    const hexFindings = findings.filter((f) => f.patternId === "hex-64");
    assertEquals(hexFindings.length, 0);
  });

  await t.step(
    "detects environment variable secrets at medium level",
    () => {
      const content = "PRIVATE_KEY=sk_live_abc123def456";
      const findings = scanContent(".env", content, "medium");
      const envFindings = findings.filter(
        (f) => f.patternId === "env-secret",
      );
      assertEquals(envFindings.length >= 1, true);
    },
  );

  await t.step(
    "detects suspicious .env filename at medium level",
    () => {
      const content = "# Just a comment";
      const findings = scanContent(".env", content, "medium");
      const filenameFindings = findings.filter(
        (f) => f.patternId === "dotenv-file",
      );
      assertEquals(filenameFindings.length, 1);
      assertEquals(filenameFindings[0].line, 0); // Filename match, not line match
    },
  );

  await t.step("returns correct line numbers", () => {
    const content = "line 1\nline 2\nPRIVATE_KEY=secret\nline 4";
    const findings = scanContent("config.txt", content, "medium");
    const envFindings = findings.filter((f) => f.patternId === "env-secret");
    assertEquals(envFindings.length >= 1, true);
    assertEquals(envFindings[0].line, 3);
  });

  await t.step("returns empty for clean content", () => {
    const content =
      "<!DOCTYPE html>\n<html>\n<body>Hello</body>\n</html>";
    const findings = scanContent("index.html", content, "medium");
    assertEquals(findings.length, 0);
  });

  await t.step("truncates match preview", () => {
    const content =
      "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe5ycp";
    const findings = scanContent("test.js", content, "low");
    assertEquals(findings.length >= 1, true);
    assertEquals(findings[0].matchPreview.length <= 7, true);
    assertEquals(findings[0].matchPreview.endsWith("..."), true);
  });
});

Deno.test("scanFileList", async (t) => {
  await t.step("scans text files and skips binary files", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      // Create a text file with a secret
      const textFile = `${tempDir}/leaked.js`;
      await Deno.writeTextFile(
        textFile,
        'const key = "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe5ycp";',
      );

      // Create a binary file
      const binaryFile = `${tempDir}/image.png`;
      await Deno.writeFile(
        binaryFile,
        new Uint8Array([137, 80, 78, 71, 0, 0, 0]),
      ); // PNG header with null

      const files: ScanFileEntry[] = [
        { path: "leaked.js", absolutePath: textFile },
        { path: "image.png", absolutePath: binaryFile },
      ];

      const result = await scanFileList(files, { level: "low" });

      assertEquals(result.filesScanned, 1);
      assertEquals(result.filesSkipped, 1);
      assertEquals(result.findings.length >= 1, true);
      assertEquals(result.scanLevel, "low");
      assertEquals(result.duration >= 0, true);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("defaults to medium scan level", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const file = `${tempDir}/clean.txt`;
      await Deno.writeTextFile(file, "nothing here");

      const files: ScanFileEntry[] = [
        { path: "clean.txt", absolutePath: file },
      ];

      const result = await scanFileList(files);
      assertEquals(result.scanLevel, "medium");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });
});

Deno.test("scanDirectory", async (t) => {
  await t.step("scans directory and returns results", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(
        `${tempDir}/safe.html`,
        "<html><body>Hello</body></html>",
      );
      await Deno.writeTextFile(
        `${tempDir}/leaked.js`,
        'const nsecKey = "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe5ycp";',
      );

      const result = await scanDirectory(tempDir, { level: "low" });

      assertEquals(result.filesScanned, 2);
      assertEquals(result.findings.length >= 1, true);
      const nsecFindings = result.findings.filter(
        (f) => f.patternId === "nsec-key",
      );
      assertEquals(nsecFindings.length >= 1, true);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });
});
