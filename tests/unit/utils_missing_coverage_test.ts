import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Command } from "@cliffy/command";
import { extractTagValue, createGroupedCommand } from "../../src/lib/utils.ts";
import type { NostrEvent } from "../../src/lib/nostr.ts";

Deno.test("extractTagValue - Missing Coverage", async (t) => {
  await t.step("should extract values from properly formatted tags", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey", 
      created_at: 123456,
      kind: 1,
      tags: [
        ["p", "pubkey123"],
        ["e", "eventid456"],
        ["t", "nostr"]
      ],
      content: "test content",
      sig: "test-sig"
    };
    
    assertEquals(extractTagValue(event, "p"), "pubkey123");
    assertEquals(extractTagValue(event, "e"), "eventid456");
    assertEquals(extractTagValue(event, "t"), "nostr");
  });

  await t.step("should return undefined for missing tags", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey",
      created_at: 123456,
      kind: 1,
      tags: [["p", "pubkey123"]],
      content: "test content",
      sig: "test-sig"
    };
    
    assertEquals(extractTagValue(event, "missing"), undefined);
  });

  await t.step("should handle tags with insufficient length", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey",
      created_at: 123456,
      kind: 1,
      tags: [
        ["p"], // Only tag name, no value
        ["e", "eventid"] // Valid tag
      ],
      content: "test content",
      sig: "test-sig"
    };
    
    assertEquals(extractTagValue(event, "p"), undefined);
    assertEquals(extractTagValue(event, "e"), "eventid");
  });

  await t.step("should handle empty tags array", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey",
      created_at: 123456,
      kind: 1,
      tags: [],
      content: "test content",
      sig: "test-sig"
    };
    
    assertEquals(extractTagValue(event, "any"), undefined);
  });

  await t.step("should return first matching tag value", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey",
      created_at: 123456,
      kind: 1,
      tags: [
        ["t", "first"],
        ["t", "second"],
        ["p", "pubkey"]
      ],
      content: "test content",
      sig: "test-sig"
    };
    
    assertEquals(extractTagValue(event, "t"), "first");
    assertEquals(extractTagValue(event, "p"), "pubkey");
  });
});

Deno.test("createGroupedCommand - Missing Coverage", async (t) => {
  await t.step("should create and register grouped command", () => {
    const parentCommand = new Command()
      .name("parent")
      .description("Parent command");
    
    const subCommand = createGroupedCommand(
      parentCommand,
      "subgroup",
      "Subgroup description"
    );
    
    assertExists(subCommand);
    assertEquals(subCommand instanceof Command, true);
    assertEquals(subCommand.getName(), "subgroup");
    assertEquals(subCommand.getDescription(), "Subgroup description");
    
    // Verify the command was registered on parent
    const registeredCommands = parentCommand.getCommands();
    const foundCommand = registeredCommands.find(cmd => cmd.getName() === "subgroup");
    assertExists(foundCommand);
    assertEquals(foundCommand.getDescription(), "Subgroup description");
  });

  await t.step("should allow chaining commands", () => {
    const parentCommand = new Command()
      .name("cli")
      .description("CLI tool");
    
    const groupCommand = createGroupedCommand(
      parentCommand,
      "secrets",
      "Secret management commands"
    );
    
    // Add nested commands to the returned group
    groupCommand
      .command("list", "List secrets")
      .action(() => {});
    
    groupCommand
      .command("add", "Add secret")
      .action(() => {});
    
    const nestedCommands = groupCommand.getCommands();
    assertEquals(nestedCommands.length, 2);
    assertEquals(nestedCommands[0].getName(), "list");
    assertEquals(nestedCommands[1].getName(), "add");
  });

  await t.step("should register action that shows help", () => {
    const parentCommand = new Command()
      .name("main")
      .description("Main command");
    
    const groupCommand = createGroupedCommand(
      parentCommand,
      "group", 
      "Group commands"
    );
    
    // Verify the command was registered
    const registeredCommand = parentCommand.getCommands()
      .find(cmd => cmd.getName() === "group");
    
    assertExists(registeredCommand);
    assertEquals(registeredCommand.getName(), "group");
    assertEquals(registeredCommand.getDescription(), "Group commands");
    
    // The action should be configured to show help, but we can't easily test
    // the execution without triggering the CLI framework
  });

  await t.step("should handle multiple grouped commands", () => {
    const parentCommand = new Command()
      .name("app")
      .description("Application");
    
    const secrets = createGroupedCommand(parentCommand, "secrets", "Secret commands");
    const files = createGroupedCommand(parentCommand, "files", "File commands");
    const config = createGroupedCommand(parentCommand, "config", "Config commands");
    
    const commands = parentCommand.getCommands();
    assertEquals(commands.length, 3);
    
    const commandNames = commands.map(cmd => cmd.getName()).sort();
    assertEquals(commandNames, ["config", "files", "secrets"]);
  });
});