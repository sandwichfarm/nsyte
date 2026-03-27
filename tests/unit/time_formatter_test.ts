// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { formatAge, formatManifestIdWithAge } from "../../src/ui/time-formatter.ts";

describe("formatAge", () => {
  it("formats recent timestamps as relative age", () => {
    const nowMs = 1000 * 60 * 60 * 24 * 40;
    const createdAt = Math.floor((nowMs - (2 * 60 * 60 * 1000)) / 1000);

    assertEquals(formatAge(createdAt, nowMs), "2 hours ago");
  });

  it("formats older timestamps as years instead of absolute dates", () => {
    const nowMs = 1000 * 60 * 60 * 24 * 800;
    const createdAt = Math.floor((nowMs - (400 * 24 * 60 * 60 * 1000)) / 1000);

    assertEquals(formatAge(createdAt, nowMs), "1 year ago");
  });
});

describe("formatManifestIdWithAge", () => {
  it("appends manifest age to the identifier", () => {
    const nowMs = 1000 * 60 * 60 * 24 * 10;
    const createdAt = Math.floor((nowMs - (3 * 24 * 60 * 60 * 1000)) / 1000);

    assertEquals(
      formatManifestIdWithAge("manifest123", createdAt, nowMs),
      `manifest123 (${formatAge(createdAt, nowMs)})`,
    );
  });
});
