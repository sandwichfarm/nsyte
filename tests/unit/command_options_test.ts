import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Command } from "@cliffy/command";
import {
  addAuthOptions,
  addBunkerOption,
  addCommonOptions,
  addNbunksecOption,
  addPrivateKeyOption,
  addPubkeyOption,
  addRelayOption,
  addServerOption,
  type CommonOptions,
} from "../../src/lib/command-options.ts";

Deno.test("Command Options - Basic Option Addition", async (t) => {
  await t.step("addRelayOption should add relays option", () => {
    const command = new Command().name("test");
    addRelayOption(command);

    const options = command.getOptions();
    const relaysOption = options.find((opt) => opt.name === "relays");

    assertExists(relaysOption);
    assertEquals(relaysOption.name, "relays");
    assertEquals(relaysOption.description, "The nostr relays to use (comma separated).");
  });

  await t.step("addServerOption should add servers option", () => {
    const command = new Command().name("test");
    addServerOption(command);

    const options = command.getOptions();
    const serversOption = options.find((opt) => opt.name === "servers");

    assertExists(serversOption);
    assertEquals(serversOption.name, "servers");
    assertEquals(serversOption.description, "The servers to use (comma separated).");
  });

  await t.step("addPrivateKeyOption should add privatekey option", () => {
    const command = new Command().name("test");
    addPrivateKeyOption(command);

    const options = command.getOptions();
    const privatekeyOption = options.find((opt) => opt.name === "privatekey");

    assertExists(privatekeyOption);
    assertEquals(privatekeyOption.name, "privatekey");
    assertEquals(privatekeyOption.description, "The private key (nsec/hex) to use for signing.");
  });

  await t.step("addPubkeyOption should add pubkey option", () => {
    const command = new Command().name("test");
    addPubkeyOption(command);

    const options = command.getOptions();
    const pubkeyOption = options.find((opt) => opt.name === "pubkey");

    assertExists(pubkeyOption);
    assertEquals(pubkeyOption.name, "pubkey");
    assertEquals(pubkeyOption.description, "The public key to use");
  });

  await t.step("addBunkerOption should add bunker option", () => {
    const command = new Command().name("test");
    addBunkerOption(command);

    const options = command.getOptions();
    const bunkerOption = options.find((opt) => opt.name === "bunker");

    assertExists(bunkerOption);
    assertEquals(bunkerOption.name, "bunker");
    assertEquals(bunkerOption.description, "The NIP-46 bunker URL to use for signing.");
  });

  await t.step("addNbunksecOption should add nbunksec option", () => {
    const command = new Command().name("test");
    addNbunksecOption(command);

    const options = command.getOptions();
    const nbunksecOption = options.find((opt) => opt.name === "nbunksec");

    assertExists(nbunksecOption);
    assertEquals(nbunksecOption.name, "nbunksec");
    assertEquals(
      nbunksecOption.description,
      "The nbunksec string to use for authentication (for CI/CD).",
    );
  });
});

Deno.test("Command Options - Combination Functions", async (t) => {
  await t.step("addAuthOptions should add all auth options", () => {
    const command = new Command().name("test");
    addAuthOptions(command);

    const options = command.getOptions();
    const optionNames = options.map((opt) => opt.name);

    assertEquals(optionNames.includes("privatekey"), true);
    assertEquals(optionNames.includes("bunker"), true);
    assertEquals(optionNames.includes("nbunksec"), true);
    assertEquals(options.length, 3);
  });

  await t.step("addCommonOptions should add relay and auth options", () => {
    const command = new Command().name("test");
    addCommonOptions(command);

    const options = command.getOptions();
    const optionNames = options.map((opt) => opt.name);

    assertEquals(optionNames.includes("relays"), true);
    assertEquals(optionNames.includes("privatekey"), true);
    assertEquals(optionNames.includes("bunker"), true);
    assertEquals(optionNames.includes("nbunksec"), true);
    assertEquals(options.length, 4);
  });
});

Deno.test("Command Options - Multiple Options", async (t) => {
  await t.step("should be able to add multiple options to same command", () => {
    const command = new Command().name("test");

    addRelayOption(command);
    addServerOption(command);
    addPrivateKeyOption(command);
    addBunkerOption(command);

    const options = command.getOptions();
    assertEquals(options.length, 4);

    const optionNames = options.map((opt) => opt.name);
    assertEquals(optionNames.includes("relays"), true);
    assertEquals(optionNames.includes("servers"), true);
    assertEquals(optionNames.includes("privatekey"), true);
    assertEquals(optionNames.includes("bunker"), true);
  });

  await t.step("should maintain command structure with options", () => {
    const command = new Command()
      .name("test")
      .description("Test command");

    addRelayOption(command);
    addBunkerOption(command);

    assertEquals(command.getName(), "test");
    assertEquals(command.getDescription(), "Test command");
    assertEquals(command.getOptions().length, 2);
  });
});

Deno.test("Command Options - Interface", async (t) => {
  await t.step("CommonOptions interface should accept valid option types", () => {
    const options: CommonOptions = {
      relays: "wss://relay1.com,wss://relay2.com",
      privatekey: "nsec1234567890abcdef",
      pubkey: "npub1234567890abcdef",
      bunker: "bunker://pubkey?relay=wss://relay.com",
      servers: "https://server1.com,https://server2.com",
      nbunksec: "nbunksec1234567890",
    };

    assertEquals(typeof options.relays, "string");
    assertEquals(typeof options.privatekey, "string");
    assertEquals(typeof options.pubkey, "string");
    assertEquals(typeof options.bunker, "string");
    assertEquals(typeof options.servers, "string");
    assertEquals(typeof options.nbunksec, "string");
  });

  await t.step("CommonOptions interface should accept partial options", () => {
    const options: CommonOptions = {
      relays: "wss://relay.com",
    };

    assertEquals(typeof options.relays, "string");
    assertEquals(options.privatekey, undefined);
    assertEquals(options.servers, undefined);
  });
});
