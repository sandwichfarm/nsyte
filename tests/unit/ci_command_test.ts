import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Command } from "@cliffy/command";
import { restore, spy, stub } from "std/testing/mock.ts";
import { registerCICommand } from "../../src/commands/ci.ts";

Deno.test("CI Command - Registration", async (t) => {
  await t.step("should register ci command with correct properties", () => {
    const program = new Command();
    registerCICommand(program);

    const commands = program.getCommands();
    const ciCommand = commands.find((cmd) => cmd.getName() === "ci");

    assertExists(ciCommand);
    assertEquals(ciCommand.getName(), "ci");
    assertEquals(
      ciCommand.getDescription(),
      "Create an nbunksec string for CI/CD use (ephemeral, never stored to disk)",
    );
  });

  await t.step("should have optional bunker URL argument", () => {
    const program = new Command();
    registerCICommand(program);

    const ciCommand = program.getCommands().find((cmd) => cmd.getName() === "ci");
    assertExists(ciCommand);

    // The ci command should accept an optional URL argument
    const args = ciCommand.getArguments();
    assertEquals(args.length, 1);
    assertEquals(args[0].name, "url");
    // For optional arguments, required property might be undefined
    assertEquals(args[0].required !== true, true);
  });

  await t.step("should be properly configured", () => {
    const program = new Command();
    registerCICommand(program);

    const ciCommand = program.getCommands().find((cmd) => cmd.getName() === "ci");
    assertExists(ciCommand);

    // Verify basic command structure
    assertEquals(typeof ciCommand.getName(), "string");
    assertEquals(typeof ciCommand.getDescription(), "string");
  });
});
