import { assertEquals } from "std/assert/mod.ts";
import {
  type DisplayManager,
  type DisplayMode,
  getDisplayManager,
} from "../../src/lib/display-mode.ts";

Deno.test("Display Mode - getDisplayManager", async (t) => {
  await t.step("should return a display manager instance", () => {
    const manager = getDisplayManager();
    assertEquals(typeof manager, "object");
    assertEquals(typeof manager.getMode, "function");
    assertEquals(typeof manager.isInteractive, "function");
    assertEquals(typeof manager.configureFromOptions, "function");
  });

  await t.step("should return same instance (singleton)", () => {
    const manager1 = getDisplayManager();
    const manager2 = getDisplayManager();
    assertEquals(manager1, manager2);
  });
});

Deno.test("Display Mode - DisplayManager functionality", async (t) => {
  const manager = getDisplayManager();

  await t.step("should have default mode", () => {
    const mode = manager.getMode();
    assertEquals(typeof mode, "string");
    assertEquals(["interactive", "non-interactive", "debug"].includes(mode), true);
  });

  await t.step("should determine if interactive", () => {
    const isInteractive = manager.isInteractive();
    assertEquals(typeof isInteractive, "boolean");
  });

  await t.step("should configure from options with verbose", () => {
    manager.configureFromOptions({ verbose: true });
    const mode = manager.getMode();
    assertEquals(mode, "debug");
  });

  await t.step("should configure from options with non-interactive", () => {
    manager.configureFromOptions({ nonInteractive: true });
    const isInteractive = manager.isInteractive();
    assertEquals(isInteractive, false);
  });

  await t.step("should configure from options with non-interactive mode", () => {
    manager.configureFromOptions({ nonInteractive: true });
    const mode = manager.getMode();
    assertEquals(mode, "non-interactive");
  });

  await t.step("should handle multiple options with priority", () => {
    // Non-interactive takes precedence over verbose
    manager.configureFromOptions({ verbose: true, nonInteractive: true });
    assertEquals(manager.getMode(), "non-interactive");

    // Verbose mode when not non-interactive
    manager.configureFromOptions({ verbose: true, nonInteractive: false });
    assertEquals(manager.getMode(), "debug");
  });

  await t.step("should reset to defaults", () => {
    // Configure with specific options
    manager.configureFromOptions({ verbose: true, nonInteractive: true });

    // Reset by configuring with empty options
    manager.configureFromOptions({});

    // Should return to defaults
    const mode = manager.getMode();
    assertEquals(mode, "interactive");
  });
});

Deno.test("Display Mode - Options interface", async (t) => {
  await t.step("should handle all option combinations", () => {
    const manager = getDisplayManager();

    const testCases = [
      { options: { verbose: false }, expectedMode: "interactive" },
      { options: { verbose: true }, expectedMode: "debug" },
      { options: { nonInteractive: true }, expectedMode: "non-interactive" },
      { options: { verbose: true, nonInteractive: true }, expectedMode: "non-interactive" },
      { options: { verbose: true, nonInteractive: false }, expectedMode: "debug" },
    ];

    for (const testCase of testCases) {
      manager.configureFromOptions(testCase.options);
      assertEquals(manager.getMode(), testCase.expectedMode);
    }
  });

  await t.step("should handle nonInteractive option", () => {
    const manager = getDisplayManager();

    manager.configureFromOptions({ nonInteractive: false });
    assertEquals(manager.isInteractive(), true);

    manager.configureFromOptions({ nonInteractive: true });
    assertEquals(manager.isInteractive(), false);
  });

  await t.step("should handle undefined options gracefully", () => {
    const manager = getDisplayManager();

    manager.configureFromOptions({
      verbose: undefined,
      nonInteractive: undefined,
    });

    // Should use defaults
    assertEquals(manager.getMode(), "interactive");
    assertEquals(manager.isInteractive(), true);
  });
});
