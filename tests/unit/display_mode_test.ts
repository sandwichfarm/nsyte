import { assertEquals } from "std/assert/mod.ts";
import { describe, it } from "https://jsr.io/@std/testing/1.0.12/bdd.ts";
import { 
  DisplayMode,
  getDisplayManager,
  createDisplayManager 
} from "../../src/lib/display-mode.ts";

describe("DisplayMode", () => {
  describe("DisplayMode enum", () => {
    it("should have correct values", () => {
      assertEquals(DisplayMode.Interactive, "interactive");
      assertEquals(DisplayMode.Verbose, "verbose");
      assertEquals(DisplayMode.Silent, "silent");
    });
  });

  describe("DisplayManager", () => {
    it("should create display manager with default mode", () => {
      const manager = createDisplayManager();
      assertEquals(manager.getMode(), DisplayMode.Interactive);
      assertEquals(manager.isInteractive(), true);
      assertEquals(manager.isVerbose(), false);
      assertEquals(manager.isSilent(), false);
    });

    it("should create display manager with specific mode", () => {
      const manager = createDisplayManager(DisplayMode.Verbose);
      assertEquals(manager.getMode(), DisplayMode.Verbose);
      assertEquals(manager.isInteractive(), false);
      assertEquals(manager.isVerbose(), true);
      assertEquals(manager.isSilent(), false);
    });

    it("should handle silent mode", () => {
      const manager = createDisplayManager(DisplayMode.Silent);
      assertEquals(manager.getMode(), DisplayMode.Silent);
      assertEquals(manager.isInteractive(), false);
      assertEquals(manager.isVerbose(), false);
      assertEquals(manager.isSilent(), true);
    });

    it("should update display mode", () => {
      const manager = createDisplayManager();
      assertEquals(manager.getMode(), DisplayMode.Interactive);
      
      manager.setMode(DisplayMode.Verbose);
      assertEquals(manager.getMode(), DisplayMode.Verbose);
      assertEquals(manager.isVerbose(), true);
    });

    it("should handle debug mode", () => {
      const manager = createDisplayManager();
      assertEquals(manager.isDebug(), false);
      
      manager.setDebug(true);
      assertEquals(manager.isDebug(), true);
      
      manager.setDebug(false);
      assertEquals(manager.isDebug(), false);
    });
  });

  describe("getDisplayManager", () => {
    it("should return singleton instance", () => {
      const manager1 = getDisplayManager();
      const manager2 = getDisplayManager();
      assertEquals(manager1, manager2);
    });

    it("should maintain state across calls", () => {
      const manager = getDisplayManager();
      manager.setMode(DisplayMode.Silent);
      
      const manager2 = getDisplayManager();
      assertEquals(manager2.getMode(), DisplayMode.Silent);
      
      // Reset to default
      manager.setMode(DisplayMode.Interactive);
    });
  });
});