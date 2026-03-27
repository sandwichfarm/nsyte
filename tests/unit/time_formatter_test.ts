import { assertEquals, assertMatch } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import { formatTimestamp } from "../../src/ui/time-formatter.ts";

// Fixed reference time: 2023-11-14T22:13:20.000Z (Unix: 1700000000 seconds)
const FIXED_NOW_MS = 1700000000000;
const FIXED_NOW_S = FIXED_NOW_MS / 1000;

describe("formatTimestamp", () => {
  // deno-lint-ignore no-explicit-any
  let dateNowStub: any;

  beforeEach(() => {
    dateNowStub = stub(Date, "now", () => FIXED_NOW_MS);
  });

  afterEach(() => {
    restore();
  });

  describe("just now", () => {
    it("returns 'just now' for current timestamp (0 seconds ago)", () => {
      const result = formatTimestamp(FIXED_NOW_S);
      assertEquals(result, "just now");
    });

    it("returns 'just now' for timestamp 30 seconds ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 30);
      assertEquals(result, "just now");
    });

    it("returns 'just now' for timestamp 59 seconds ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 59);
      assertEquals(result, "just now");
    });
  });

  describe("minutes ago", () => {
    it("returns '1 minute ago' for timestamp 1 minute ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 60);
      assertEquals(result, "1 minute ago");
    });

    it("returns '2 minutes ago' for timestamp 2 minutes ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 120);
      assertEquals(result, "2 minutes ago");
    });

    it("returns '30 minutes ago' for timestamp 30 minutes ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 30 * 60);
      assertEquals(result, "30 minutes ago");
    });

    it("returns '59 minutes ago' for timestamp 59 minutes ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 59 * 60);
      assertEquals(result, "59 minutes ago");
    });
  });

  describe("hours ago", () => {
    it("returns '1 hour ago' for timestamp 1 hour ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 60 * 60);
      assertEquals(result, "1 hour ago");
    });

    it("returns '2 hours ago' for timestamp 2 hours ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 2 * 60 * 60);
      assertEquals(result, "2 hours ago");
    });

    it("returns '5 hours ago' for timestamp 5 hours ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 5 * 60 * 60);
      assertEquals(result, "5 hours ago");
    });

    it("returns '23 hours ago' for timestamp 23 hours ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 23 * 60 * 60);
      assertEquals(result, "23 hours ago");
    });
  });

  describe("days ago", () => {
    it("returns 'yesterday' for timestamp exactly 1 day ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 24 * 60 * 60);
      assertEquals(result, "yesterday");
    });

    it("returns '4 days ago' for timestamp 4 days ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 4 * 24 * 60 * 60);
      assertEquals(result, "4 days ago");
    });

    it("returns '6 days ago' for timestamp 6 days ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 6 * 24 * 60 * 60);
      assertEquals(result, "6 days ago");
    });
  });

  describe("weeks ago", () => {
    it("returns '1 week ago' for timestamp 7 days ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 7 * 24 * 60 * 60);
      assertEquals(result, "1 week ago");
    });

    it("returns '2 weeks ago' for timestamp 14 days ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 14 * 24 * 60 * 60);
      assertEquals(result, "2 weeks ago");
    });

    it("returns '3 weeks ago' for timestamp 21 days ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 21 * 24 * 60 * 60);
      assertEquals(result, "3 weeks ago");
    });
  });

  describe("months ago", () => {
    it("returns '1 month ago' for timestamp 30 days ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 30 * 24 * 60 * 60);
      assertEquals(result, "1 month ago");
    });

    it("returns '2 months ago' for timestamp 60 days ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 60 * 24 * 60 * 60);
      assertEquals(result, "2 months ago");
    });

    it("returns '6 months ago' for timestamp 180 days ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 180 * 24 * 60 * 60);
      assertEquals(result, "6 months ago");
    });
  });

  describe("1+ years ago", () => {
    it("returns absolute date string for timestamp 400 days ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 400 * 24 * 60 * 60);
      // Should match format like "Oct 17, 2022" or similar locale date
      assertMatch(result, /\w{3}\s+\d{1,2},\s+\d{4}/);
    });

    it("returns absolute date string for timestamp 2 years ago", () => {
      const result = formatTimestamp(FIXED_NOW_S - 730 * 24 * 60 * 60);
      assertMatch(result, /\w{3}\s+\d{1,2},\s+\d{4}/);
    });
  });
});
