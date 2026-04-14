import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
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
