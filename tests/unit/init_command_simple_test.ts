import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Command } from "@cliffy/command";
import { registerInitCommand } from "../../src/commands/init.ts";

Deno.test("Init Command - Basic Registration", async (t) => {
  await t.step("should register init command with correct properties", () => {
    const program = new Command();
    registerInitCommand(program);

    const commands = program.getCommands();
    const initCommand = commands.find((cmd) => cmd.getName() === "init");

    assertExists(initCommand);
    assertEquals(initCommand.getName(), "init");
    assertEquals(initCommand.getDescription(), "Initialize a new nsyte project");
  });

  await t.step("should have no options defined", () => {
    const program = new Command();
    registerInitCommand(program);

    const initCommand = program.getCommands().find((cmd) => cmd.getName() === "init");
    assertExists(initCommand);

    const options = initCommand.getOptions();
    // Should have minimal or no specific options (inherits from parent)
    assertEquals(options.length <= 2, true); // Only global options like help/version
  });

  await t.step("should be properly configured", () => {
    const program = new Command();
    registerInitCommand(program);

    const initCommand = program.getCommands().find((cmd) => cmd.getName() === "init");
    assertExists(initCommand);

    // Verify basic command structure
    assertEquals(typeof initCommand.getName(), "string");
    assertEquals(typeof initCommand.getDescription(), "string");
  });
});
