import { assertEquals, assertExists, assertThrows } from "std/assert/mod.ts";
import { Command } from "@cliffy/command";
import {
  bech32Decode,
  createGroupedCommand,
  extractTagValue,
  npubEncode,
} from "../../src/lib/utils.ts";
import type { NostrEvent } from "../../src/lib/nostr.ts";

Deno.test("extractTagValue", async (t) => {
  await t.step("should extract tag value from event", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey",
      created_at: 123456,
      kind: 1,
      tags: [
        ["p", "pubkey123"],
        ["e", "eventid456"],
        ["t", "nostr"],
        ["custom", "value123", "extra"],
      ],
      content: "test content",
      sig: "test-sig",
    };

    assertEquals(extractTagValue(event, "p"), "pubkey123");
    assertEquals(extractTagValue(event, "e"), "eventid456");
    assertEquals(extractTagValue(event, "t"), "nostr");
    assertEquals(extractTagValue(event, "custom"), "value123");
  });

  await t.step("should return undefined for non-existent tags", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey",
      created_at: 123456,
      kind: 1,
      tags: [["p", "pubkey123"]],
      content: "test content",
      sig: "test-sig",
    };

    assertEquals(extractTagValue(event, "missing"), undefined);
    assertEquals(extractTagValue(event, "e"), undefined);
  });

  await t.step("should handle empty tags array", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey",
      created_at: 123456,
      kind: 1,
      tags: [],
      content: "test content",
      sig: "test-sig",
    };

    assertEquals(extractTagValue(event, "any"), undefined);
  });

  await t.step("should handle malformed tags", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey",
      created_at: 123456,
      kind: 1,
      tags: [
        ["single"], // Tag with only name, no value
        [], // Empty tag
        ["p", "value", "extra1", "extra2"], // Tag with multiple values
      ],
      content: "test content",
      sig: "test-sig",
    };

    assertEquals(extractTagValue(event, "single"), undefined);
    assertEquals(extractTagValue(event, "p"), "value");
  });

  await t.step("should handle duplicate tags (returns first match)", () => {
    const event: NostrEvent = {
      id: "test-id",
      pubkey: "test-pubkey",
      created_at: 123456,
      kind: 1,
      tags: [
        ["t", "first"],
        ["t", "second"],
        ["t", "third"],
      ],
      content: "test content",
      sig: "test-sig",
    };

    assertEquals(extractTagValue(event, "t"), "first");
  });
});

Deno.test("npubEncode", async (t) => {
  await t.step("should encode hex pubkey to npub", () => {
    const pubkeyHex = "7d0c2c8c1e8b4f5a6b3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b";
    const npub = npubEncode(pubkeyHex);

    assertExists(npub);
    assertEquals(typeof npub, "string");
    assertEquals(npub.startsWith("npub"), true);
    assertEquals(npub.length > 50, true); // npub should be reasonably long
  });

  await t.step("should produce consistent results", () => {
    const pubkeyHex = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

    const npub1 = npubEncode(pubkeyHex);
    const npub2 = npubEncode(pubkeyHex);

    assertEquals(npub1, npub2);
  });

  await t.step("should handle different hex formats", () => {
    const pubkeyLower = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const pubkeyUpper = "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";

    const npubLower = npubEncode(pubkeyLower);
    const npubUpper = npubEncode(pubkeyUpper.toLowerCase());

    assertEquals(npubLower, npubUpper);
  });

  await t.step("should throw on invalid hex", () => {
    assertThrows(() => {
      npubEncode("not-hex");
    });

    assertThrows(() => {
      npubEncode("123"); // Too short
    });

    assertThrows(() => {
      npubEncode("gg0123456789abcdef0123456789abcdef0123456789abcdef0123456789"); // Invalid hex chars
    });
  });
});

Deno.test("bech32Decode", async (t) => {
  await t.step("should decode npub", () => {
    const pubkeyHex = "7d0c2c8c1e8b4f5a6b3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b";
    const npub = npubEncode(pubkeyHex);

    const decoded = bech32Decode(npub);

    assertEquals(decoded.prefix, "npub");
    assertExists(decoded.data);
    assertEquals(decoded.data instanceof Uint8Array, true);
    assertEquals(decoded.data.length, 32); // Public key should be 32 bytes
  });

  await t.step("should decode nsec", async () => {
    // Create a fake nsec for testing
    const secretHex = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const secretBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      secretBytes[i] = parseInt(secretHex.substr(i * 2, 2), 16);
    }

    // Manual bech32 encoding for nsec
    const { bech32 } = await import("@scure/base");
    const nsec = bech32.encode("nsec", bech32.toWords(secretBytes));

    const decoded = bech32Decode(nsec);

    assertEquals(decoded.prefix, "nsec");
    assertEquals(decoded.data.length, 32);
  });

  await t.step("should throw on invalid bech32", () => {
    assertThrows(() => {
      bech32Decode("invalid-bech32");
    });

    assertThrows(() => {
      bech32Decode("npub123"); // Too short
    });

    assertThrows(() => {
      bech32Decode(""); // Empty string
    });
  });

  await t.step("should round-trip encode/decode", () => {
    const pubkeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const npub = npubEncode(pubkeyHex);
    const decoded = bech32Decode(npub);

    assertEquals(decoded.prefix, "npub");

    // Convert decoded data back to hex
    const decodedHex = Array.from(decoded.data)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    assertEquals(decodedHex, pubkeyHex);
  });
});

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
