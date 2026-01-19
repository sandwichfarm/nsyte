import { assertEquals } from "jsr:@std/assert";
import { version } from "../../src/version.ts";

Deno.test("version", async (t) => {
  await t.step("should be a valid semantic version string", () => {
    // version should match semantic versioning pattern
    const semverPattern = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;
    assertEquals(typeof version, "string");
    assertEquals(
      semverPattern.test(version),
      true,
      `Version ${version} should match semver pattern`,
    );
  });

  await t.step("should not be empty", () => {
    assertEquals(version.length > 0, true);
  });

  await t.step("should contain only valid version characters", () => {
    // Valid version characters: digits, dots, hyphens, plus, alphanumeric
    const validChars = /^[0-9a-zA-Z.\-+]+$/;
    assertEquals(validChars.test(version), true);
  });
});
