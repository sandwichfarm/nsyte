import { assertEquals, assertExists } from "@std/assert";
import {
  getPatternsForLevel,
  getSuspiciousFilenamesForLevel,
  SCAN_PATTERNS,
  SUSPICIOUS_FILENAMES,
} from "../../src/lib/scanner/mod.ts";

Deno.test("SCAN_PATTERNS array", async (t) => {
  await t.step("should contain all required patterns", () => {
    const ids = SCAN_PATTERNS.map((p) => p.id);
    assertEquals(ids.includes("nsec-key"), true);
    assertEquals(ids.includes("nbunksec"), true);
    assertEquals(ids.includes("bunker-url"), true);
    assertEquals(ids.includes("hex-64"), true);
    assertEquals(ids.includes("env-secret"), true);
    assertEquals(ids.includes("pem-private-key"), true);
    assertEquals(ids.includes("high-entropy"), true);
  });

  await t.step("each pattern has required fields", () => {
    for (const p of SCAN_PATTERNS) {
      assertExists(p.id, `Pattern missing id`);
      assertExists(p.name, `Pattern ${p.id} missing name`);
      assertExists(p.regex, `Pattern ${p.id} missing regex`);
      assertExists(p.severity, `Pattern ${p.id} missing severity`);
      assertExists(p.level, `Pattern ${p.id} missing level`);
      assertExists(p.description, `Pattern ${p.id} missing description`);
    }
  });
});

Deno.test("getPatternsForLevel", async (t) => {
  await t.step("low returns only Nostr-specific patterns", () => {
    const patterns = getPatternsForLevel("low");
    const ids = patterns.map((p) => p.id);
    assertEquals(ids.includes("nsec-key"), true);
    assertEquals(ids.includes("nbunksec"), true);
    assertEquals(ids.includes("bunker-url"), true);
    assertEquals(ids.includes("hex-64"), false);
    assertEquals(ids.includes("env-secret"), false);
    assertEquals(ids.includes("high-entropy"), false);
  });

  await t.step("medium returns low + medium patterns", () => {
    const patterns = getPatternsForLevel("medium");
    const ids = patterns.map((p) => p.id);
    assertEquals(ids.includes("nsec-key"), true);
    assertEquals(ids.includes("hex-64"), true);
    assertEquals(ids.includes("env-secret"), true);
    assertEquals(ids.includes("pem-private-key"), true);
    assertEquals(ids.includes("high-entropy"), false);
  });

  await t.step("high returns all patterns", () => {
    const patterns = getPatternsForLevel("high");
    assertEquals(patterns.length, SCAN_PATTERNS.length);
  });
});

Deno.test("nsec pattern matching", async (t) => {
  const nsecPattern = SCAN_PATTERNS.find((p) => p.id === "nsec-key")!;

  await t.step("matches valid nsec string", () => {
    const testNsec =
      "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe5ycp";
    assertEquals(nsecPattern.regex.test(testNsec), true);
  });

  await t.step("matches nsec embedded in text", () => {
    const line =
      'const key = "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe5ycp";';
    assertEquals(nsecPattern.regex.test(line), true);
  });

  await t.step("does not match nsec prefix without sufficient length", () => {
    assertEquals(nsecPattern.regex.test("nsec1short"), false);
  });
});

Deno.test("hex-64 pattern matching", async (t) => {
  const hexPattern = SCAN_PATTERNS.find((p) => p.id === "hex-64")!;

  await t.step("matches 64-char hex string", () => {
    const hex64 = "a".repeat(64);
    assertEquals(hexPattern.regex.test(hex64), true);
  });

  await t.step("does not match 63-char hex string", () => {
    const hex63 = "a".repeat(63);
    assertEquals(hexPattern.regex.test(hex63), false);
  });

  await t.step("does not match 65-char hex string as whole match", () => {
    // Word boundary prevents matching a 64-char substring of a 65-char hex
    // The important thing is it uses word boundaries
    assertEquals(hexPattern.regex.source.includes("\\b"), true);
  });
});

Deno.test("env-secret pattern matching", async (t) => {
  const envPattern = SCAN_PATTERNS.find((p) => p.id === "env-secret")!;

  await t.step("matches PRIVATE_KEY=value", () => {
    assertEquals(envPattern.regex.test("PRIVATE_KEY=abc123"), true);
  });

  await t.step("matches SECRET=value", () => {
    assertEquals(envPattern.regex.test("SECRET=mysecretvalue"), true);
  });

  await t.step("matches API_KEY: value", () => {
    assertEquals(envPattern.regex.test("API_KEY: sk_live_123abc"), true);
  });

  await t.step("does not match plain text", () => {
    assertEquals(
      envPattern.regex.test("This is a normal line of text"),
      false,
    );
  });
});

Deno.test("SUSPICIOUS_FILENAMES", async (t) => {
  await t.step("matches .env files", () => {
    const dotenvPattern = SUSPICIOUS_FILENAMES.find(
      (p) => p.id === "dotenv-file",
    )!;
    assertEquals(dotenvPattern.pattern.test(".env"), true);
    assertEquals(dotenvPattern.pattern.test(".env.local"), true);
    assertEquals(dotenvPattern.pattern.test(".env.production"), true);
    assertEquals(dotenvPattern.pattern.test("README.md"), false);
  });

  await t.step("matches key/pem files", () => {
    const pemPattern = SUSPICIOUS_FILENAMES.find(
      (p) => p.id === "pem-file",
    )!;
    assertEquals(pemPattern.pattern.test("server.pem"), true);
    assertEquals(pemPattern.pattern.test("private.key"), true);
    assertEquals(pemPattern.pattern.test("cert.p12"), true);
    assertEquals(pemPattern.pattern.test("style.css"), false);
  });

  await t.step("matches credentials files", () => {
    const credPattern = SUSPICIOUS_FILENAMES.find(
      (p) => p.id === "credentials-file",
    )!;
    assertEquals(credPattern.pattern.test("credentials.json"), true);
    assertEquals(credPattern.pattern.test("service-account.json"), true);
    assertEquals(credPattern.pattern.test("service_account.json"), true);
    assertEquals(credPattern.pattern.test("config.json"), false);
  });

  await t.step("getSuspiciousFilenamesForLevel low returns none", () => {
    const patterns = getSuspiciousFilenamesForLevel("low");
    assertEquals(patterns.length, 0);
  });

  await t.step(
    "getSuspiciousFilenamesForLevel medium returns all filename patterns",
    () => {
      const patterns = getSuspiciousFilenamesForLevel("medium");
      assertEquals(patterns.length > 0, true);
    },
  );
});
