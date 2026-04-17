import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { fromFileUrl } from "@std/path";
import { parseTimestamp } from "../../src/lib/timestamp.ts";

describe("parseTimestamp", () => {
  describe("Unix epoch integers", () => {
    it("parses a standard Unix epoch integer string", () => {
      assertEquals(parseTimestamp("1700000000"), 1700000000);
    });

    it("parses zero (Unix epoch origin) as valid", () => {
      assertEquals(parseTimestamp("0"), 0);
    });

    it("parses a recent Unix timestamp", () => {
      assertEquals(parseTimestamp("1705320000"), 1705320000);
    });

    it("rejects negative timestamps (pre-1970)", () => {
      assertThrows(
        () => parseTimestamp("-1"),
        Error,
        "Invalid --created-at value",
      );
    });

    it("rejects fractional epoch seconds (1.5 is not a valid Unix epoch)", () => {
      assertThrows(
        () => parseTimestamp("1.5"),
        Error,
        "Invalid --created-at value",
      );
    });

    it("rejects far-future timestamps beyond year 5000 sanity check", () => {
      assertThrows(
        () => parseTimestamp("99999999999"),
        Error,
        "Invalid --created-at value",
      );
    });
  });

  describe("ISO 8601 datetime strings", () => {
    it("rejects far-future ISO 8601 dates beyond year 5000 sanity check", () => {
      assertThrows(
        () => parseTimestamp("6000-01-01T00:00:00Z"),
        Error,
        "Invalid --created-at value",
      );
    });


    it("parses ISO 8601 string with Z timezone to correct Unix seconds", () => {
      assertEquals(parseTimestamp("2024-01-15T12:00:00Z"), 1705320000);
    });

    it("parses ISO 8601 string with +00:00 offset to correct Unix seconds", () => {
      assertEquals(parseTimestamp("2024-01-15T12:00:00+00:00"), 1705320000);
    });

    it("parses ISO 8601 string without timezone as UTC (not local time)", () => {
      assertEquals(parseTimestamp("2024-01-15T12:00:00"), 1705320000);
    });

    it("parses date-only string as UTC midnight", () => {
      assertEquals(parseTimestamp("2024-01-15"), 1705276800);
    });
  });

  describe("error cases", () => {
    it("throws on garbage input with correct error message format", () => {
      assertThrows(
        () => parseTimestamp("garbage"),
        Error,
        'Invalid --created-at value "garbage". Expected Unix epoch seconds or ISO 8601 datetime.',
      );
    });

    it("throws on empty string with correct error message format", () => {
      assertThrows(
        () => parseTimestamp(""),
        Error,
        'Invalid --created-at value ""',
      );
    });

    it("throws on negative timestamps with correct error message format", () => {
      assertThrows(
        () => parseTimestamp("-1"),
        Error,
        'Invalid --created-at value "-1"',
      );
    });

    it("throws on far-future timestamp with correct error message format", () => {
      assertThrows(
        () => parseTimestamp("99999999999"),
        Error,
        'Invalid --created-at value "99999999999"',
      );
    });
  });
});

describe("--created-at CLI global option", () => {
  // Resolve the CLI entrypoint relative to the project root
  const cliPath = fromFileUrl(new URL("../../src/cli.ts", import.meta.url));

  it(
    "accepts valid Unix epoch without 'Invalid' error",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const cmd = new Deno.Command("deno", {
        args: ["run", "--allow-all", cliPath, "deploy", "--created-at", "1700000000"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await cmd.output();
      const combined = new TextDecoder().decode(result.stdout) +
        new TextDecoder().decode(result.stderr);
      // Valid input must NOT produce 'Invalid --created-at value'
      assertEquals(
        combined.includes("Invalid --created-at value"),
        false,
        `Expected no validation error, got: ${combined}`,
      );
    },
  );

  it(
    "accepts valid ISO 8601 datetime without 'Invalid' error",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const cmd = new Deno.Command("deno", {
        args: ["run", "--allow-all", cliPath, "deploy", "--created-at", "2024-01-15T12:00:00Z"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await cmd.output();
      const combined = new TextDecoder().decode(result.stdout) +
        new TextDecoder().decode(result.stderr);
      assertEquals(
        combined.includes("Invalid --created-at value"),
        false,
        `Expected no validation error, got: ${combined}`,
      );
    },
  );

  it(
    "exits non-zero with error message for invalid value",
    { sanitizeOps: false, sanitizeResources: false },
    async () => {
      const cmd = new Deno.Command("deno", {
        args: ["run", "--allow-all", cliPath, "deploy", "--created-at", "garbage"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await cmd.output();
      const combined = new TextDecoder().decode(result.stdout) +
        new TextDecoder().decode(result.stderr);
      // Must exit non-zero
      assertEquals(
        result.code !== 0,
        true,
        `Expected non-zero exit code, got: ${result.code}`,
      );
      // Must include the validation error message
      assertEquals(
        combined.includes("Invalid --created-at value"),
        true,
        `Expected 'Invalid --created-at value' in output, got: ${combined}`,
      );
    },
  );
});
