import { assertEquals, assertStringIncludes } from "std/testing/asserts.ts";
import { describe, it } from "std/testing/bdd.ts";
import { 
  showBunkerHelp, 
  listBunkers, 
  importNbunk, 
  exportNbunk, 
  connectBunker, 
  useBunkerForProject,
  removeBunker
} from "../../src/commands/bunker.ts";

// Helper function to capture console output
function captureConsoleOutput(fn: () => Promise<void> | void): Promise<string> {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  
  let output = "";
  
  console.log = (...args: unknown[]) => {
    output += args.join(" ") + "\n";
  };
  
  console.error = (...args: unknown[]) => {
    output += "ERROR: " + args.join(" ") + "\n";
  };
  
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        return output;
      });
    } else {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      return Promise.resolve(output);
    }
  } catch (error) {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    throw error;
  }
}

describe("CLI Bunker Command Exports", () => {
  // We're testing that the bunker commands are properly exported and have the expected signatures
  
  it("should export showBunkerHelp function", () => {
    assertEquals(typeof showBunkerHelp, "function", "showBunkerHelp should be a function");
    assertEquals(showBunkerHelp.length, 0, "showBunkerHelp should take 0 arguments");
  });
  
  it("should export listBunkers function", () => {
    assertEquals(typeof listBunkers, "function", "listBunkers should be a function");
    assertEquals(listBunkers.length, 0, "listBunkers should take 0 arguments");
  });
  
  it("should export importNbunk function", () => {
    assertEquals(typeof importNbunk, "function", "importNbunk should be a function");
    assertEquals(importNbunk.length, 1, "importNbunk should take 1 optional argument");
  });
  
  it("should export exportNbunk function", () => {
    assertEquals(typeof exportNbunk, "function", "exportNbunk should be a function");
    assertEquals(exportNbunk.length, 1, "exportNbunk should take 1 optional argument");
  });
  
  it("should export connectBunker function", () => {
    assertEquals(typeof connectBunker, "function", "connectBunker should be a function");
    assertEquals(connectBunker.length, 1, "connectBunker should take 1 optional argument");
  });
  
  it("should export useBunkerForProject function", () => {
    assertEquals(typeof useBunkerForProject, "function", "useBunkerForProject should be a function");
    assertEquals(useBunkerForProject.length, 1, "useBunkerForProject should take 1 optional argument");
  });
  
  it("should export removeBunker function", () => {
    assertEquals(typeof removeBunker, "function", "removeBunker should be a function");
    assertEquals(removeBunker.length, 1, "removeBunker should take 1 optional argument");
  });
  
  it("help output should include all subcommands", async () => {
    const originalExit = Deno.exit;
    // We need to mock Deno.exit to prevent the test from exiting
    // @ts-ignore: Override for testing
    Deno.exit = () => undefined as never;
    
    try {
      const output = await captureConsoleOutput(() => showBunkerHelp());
      
      assertStringIncludes(output, "Bunker Command Help");
      assertStringIncludes(output, "list");
      assertStringIncludes(output, "import");
      assertStringIncludes(output, "export");
      assertStringIncludes(output, "connect");
      assertStringIncludes(output, "use");
      assertStringIncludes(output, "remove");
      assertStringIncludes(output, "help");
      
      // Check that CI/CD usage is documented
      assertStringIncludes(output, "CI/CD Usage");
      assertStringIncludes(output, "--nbunk");
    } finally {
      Deno.exit = originalExit;
    }
  });
}); 