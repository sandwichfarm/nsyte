import { assertEquals } from "std/assert/mod.ts";
import { 
  DisplayMode,
  getDisplayManager
} from "../../src/lib/display-mode.ts";

Deno.test("DisplayMode enum", async (t) => {
  await t.step("should have correct values", () => {
    assertEquals(DisplayMode.INTERACTIVE, "interactive");
    assertEquals(DisplayMode.NON_INTERACTIVE, "non-interactive");
    assertEquals(DisplayMode.DEBUG, "debug");
  });
});

Deno.test("DisplayManager", async (t) => {
  const manager = getDisplayManager();

  await t.step("should have default mode", () => {
    // Reset to a known state
    manager.setMode(DisplayMode.INTERACTIVE);
    assertEquals(manager.getMode(), DisplayMode.INTERACTIVE);
    assertEquals(manager.isInteractive(), true);
    assertEquals(manager.isNonInteractive(), false);
    assertEquals(manager.isDebug(), false);
  });

  await t.step("should set non-interactive mode", () => {
    manager.setMode(DisplayMode.NON_INTERACTIVE);
    assertEquals(manager.getMode(), DisplayMode.NON_INTERACTIVE);
    assertEquals(manager.isInteractive(), false);
    assertEquals(manager.isNonInteractive(), true);
    assertEquals(manager.isDebug(), false);
  });

  await t.step("should set debug mode", () => {
    manager.setMode(DisplayMode.DEBUG);
    assertEquals(manager.getMode(), DisplayMode.DEBUG);
    assertEquals(manager.isInteractive(), false);
    assertEquals(manager.isNonInteractive(), false);
    assertEquals(manager.isDebug(), true);
  });

  await t.step("should handle verbose mode", () => {
    manager.setVerbose(false);
    assertEquals(manager.isVerbose(), false);
    
    manager.setVerbose(true);
    assertEquals(manager.isVerbose(), true);
    
    manager.setVerbose(false);
    assertEquals(manager.isVerbose(), false);
  });

  await t.step("should configure from options", () => {
    // Test non-interactive option
    manager.configureFromOptions({ nonInteractive: true });
    assertEquals(manager.isNonInteractive(), true);
    
    // Test verbose option (should set debug mode if not already non-interactive)
    manager.setMode(DisplayMode.INTERACTIVE);
    manager.configureFromOptions({ verbose: true });
    assertEquals(manager.isVerbose(), true);
    assertEquals(manager.isDebug(), true);
    
    // Test verbose with non-interactive (non-interactive takes precedence)
    manager.configureFromOptions({ nonInteractive: true, verbose: true });
    assertEquals(manager.isNonInteractive(), true);
    assertEquals(manager.isVerbose(), true);
  });
});

Deno.test("getDisplayManager", async (t) => {
  await t.step("should return singleton instance", () => {
    const manager1 = getDisplayManager();
    const manager2 = getDisplayManager();
    assertEquals(manager1, manager2);
  });

  await t.step("should maintain state across calls", () => {
    const manager = getDisplayManager();
    manager.setMode(DisplayMode.DEBUG);
    manager.setVerbose(true);
    
    const manager2 = getDisplayManager();
    assertEquals(manager2.getMode(), DisplayMode.DEBUG);
    assertEquals(manager2.isVerbose(), true);
    
    // Reset to default
    manager.setMode(DisplayMode.INTERACTIVE);
    manager.setVerbose(false);
  });
});