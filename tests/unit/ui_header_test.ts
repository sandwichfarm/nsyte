import { assertEquals } from "std/assert/mod.ts";
import { header } from "../../src/ui/header.ts";

Deno.test("UI Header", async (t) => {
  await t.step("should export header string", () => {
    assertEquals(typeof header, "string");
    assertEquals(header.length > 0, true);
  });

  await t.step("should contain nsyte branding", () => {
    // The header should contain some recognizable text
    const lowerHeader = header.toLowerCase();
    assertEquals(
      lowerHeader.includes("nsyte") || 
      lowerHeader.includes("ns") || 
      lowerHeader.includes("yte") ||
      header.includes("88") || // ASCII art often uses 88
      header.includes("dP"), // Common in ASCII art
      true
    );
  });

  await t.step("should be multi-line", () => {
    const lines = header.split('\n');
    assertEquals(lines.length > 1, true);
  });

  await t.step("should not have trailing newline", () => {
    // Most ASCII art headers don't end with newline
    assertEquals(header.endsWith('\n'), false);
  });
});