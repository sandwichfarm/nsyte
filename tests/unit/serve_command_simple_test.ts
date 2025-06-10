import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Command } from "@cliffy/command";
import { registerServeCommand } from "../../src/commands/serve.ts";

Deno.test("Serve Command - Basic Registration", async (t) => {
  await t.step("should register serve command with correct properties", () => {
    const program = new Command();
    registerServeCommand(program);
    
    const commands = program.getCommands();
    const serveCommand = commands.find(cmd => cmd.getName() === "serve");
    
    assertExists(serveCommand);
    assertEquals(serveCommand.getName(), "serve");
    assertEquals(serveCommand.getDescription(), "Build and serve your local nsite files");
  });

  await t.step("should have port and dir options", () => {
    const program = new Command();
    registerServeCommand(program);
    
    const serveCommand = program.getCommands().find(cmd => cmd.getName() === "serve");
    assertExists(serveCommand);
    
    const options = serveCommand.getOptions();
    const hasPortOption = options.some(opt => 
      opt.flags.includes("--port") && opt.flags.includes("-p")
    );
    const hasDirOption = options.some(opt => 
      opt.flags.includes("--dir") && opt.flags.includes("-d")
    );
    
    assertEquals(hasPortOption, true);
    assertEquals(hasDirOption, true);
  });

  await t.step("should have default values for options", () => {
    const program = new Command();
    registerServeCommand(program);
    
    const serveCommand = program.getCommands().find(cmd => cmd.getName() === "serve");
    assertExists(serveCommand);
    
    const options = serveCommand.getOptions();
    const portOption = options.find(opt => opt.flags.includes("--port"));
    const dirOption = options.find(opt => opt.flags.includes("--dir"));
    
    assertExists(portOption);
    assertExists(dirOption);
    assertEquals(portOption.default, 8080);
    assertEquals(dirOption.default, ".");
  });

  await t.step("should be properly configured", () => {
    const program = new Command();
    registerServeCommand(program);
    
    const serveCommand = program.getCommands().find(cmd => cmd.getName() === "serve");
    assertExists(serveCommand);
    
    // Verify basic command structure
    assertEquals(typeof serveCommand.getName(), "string");
    assertEquals(typeof serveCommand.getDescription(), "string");
  });
});