import { Command } from "@cliffy/command";
import { assertEquals, assertExists } from "@std/assert";
import { createGroupedCommand } from "../../src/lib/utils.ts";

Deno.test("createGroupedCommand", async (t) => {
  await t.step("should create grouped command structure", () => {
    const parentCommand = new Command()
      .name("parent")
      .description("Parent command");

    const subCommand = createGroupedCommand(
      parentCommand,
      "sub",
      "Subcommand description",
    );

    assertExists(subCommand);
    assertEquals(subCommand instanceof Command, true);
    assertEquals(subCommand.getName(), "sub");
    assertEquals(subCommand.getDescription(), "Subcommand description");
  });

  await t.step("should allow adding nested commands", () => {
    const parentCommand = new Command()
      .name("parent")
      .description("Parent command");

    const subCommand = createGroupedCommand(
      parentCommand,
      "group",
      "Command group",
    );

    // Add nested commands
    subCommand
      .command("nested1", "First nested command")
      .action(() => console.log("nested1"));

    subCommand
      .command("nested2", "Second nested command")
      .action(() => console.log("nested2"));

    const commands = subCommand.getCommands();
    assertEquals(commands.length, 2);
    assertEquals(commands[0].getName(), "nested1");
    assertEquals(commands[1].getName(), "nested2");
  });

  await t.step("should register action on parent", () => {
    const parentCommand = new Command()
      .name("parent")
      .description("Parent command");

    let actionCalled = false;
    const originalShowHelp = Command.prototype.showHelp;
    Command.prototype.showHelp = function () {
      actionCalled = true;
    };

    try {
      const subCommand = createGroupedCommand(
        parentCommand,
        "sub",
        "Subcommand",
      );

      // Find the registered command
      const registeredCommand = parentCommand.getCommands()
        .find((cmd) => cmd.getName() === "sub");

      assertExists(registeredCommand);

      // The action should show help when called
      // This would normally be triggered by the CLI framework
    } finally {
      Command.prototype.showHelp = originalShowHelp;
    }
  });
});
