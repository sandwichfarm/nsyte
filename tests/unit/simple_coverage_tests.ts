import { assertEquals, assertExists } from "std/assert/mod.ts";
import { spy, stub, restore } from "std/testing/mock.ts";

// Test files.ts
Deno.test("Files - basic file operations", async (t) => {
  await t.step("should have access to file utilities", async () => {
    const filesModule = await import("../../src/lib/files.ts");
    assertExists(filesModule.readFile);
    assertExists(filesModule.writeFile);
    assertExists(filesModule.directoryExists);
    assertExists(filesModule.createDirectory);
    assertExists(filesModule.deleteFile);
    assertExists(filesModule.watchFiles);
  });
});

// Test config.ts functions
Deno.test("Config - module exports", async (t) => {
  await t.step("should export config functions", async () => {
    const configModule = await import("../../src/lib/config.ts");
    assertExists(configModule.readProjectFile);
    assertExists(configModule.writeProjectFile);
    assertExists(configModule.setupProject);
    assertExists(configModule.loadConfig);
    assertExists(configModule.saveConfig);
  });
});

// Test upload.ts
Deno.test("Upload - module structure", async (t) => {
  await t.step("should export upload functionality", async () => {
    const uploadModule = await import("../../src/lib/upload.ts");
    assertExists(uploadModule.uploadFile);
    assertExists(uploadModule.uploadToServer);
    assertExists(uploadModule.calculateFileHash);
  });
});

// Test signer.ts
Deno.test("Signer - module exports", async (t) => {
  await t.step("should export signer utilities", async () => {
    const signerModule = await import("../../src/lib/signer.ts");
    assertExists(signerModule.createSigner);
    assertExists(signerModule.createSignerFromPrivateKey);
  });
});

// Test message-collector.ts
Deno.test("MessageCollector - basic functionality", async (t) => {
  await t.step("should create message collector", async () => {
    const { MessageCollector } = await import("../../src/lib/message-collector.ts");
    const collector = new MessageCollector();
    assertExists(collector);
    assertExists(collector.addMessage);
    assertExists(collector.addRelayMessage);
    assertExists(collector.getMessages);
  });
});

// Test display-mode improvements
Deno.test("DisplayMode - additional coverage", async (t) => {
  await t.step("should handle display modes", async () => {
    const displayModule = await import("../../src/lib/display-mode.ts");
    assertExists(displayModule.getDisplayMode);
    assertExists(displayModule.setDisplayMode);
    assertExists(displayModule.DisplayMode);
    
    // Test enum values
    assertEquals(displayModule.DisplayMode.Normal, "normal");
    assertEquals(displayModule.DisplayMode.Compact, "compact");
    assertEquals(displayModule.DisplayMode.Verbose, "verbose");
  });
});

// Test formatters.ts
Deno.test("Formatters - basic functions", async (t) => {
  await t.step("should export formatting functions", async () => {
    const formattersModule = await import("../../src/ui/formatters.ts");
    assertExists(formattersModule.formatSize);
    assertExists(formattersModule.formatDuration);
    assertExists(formattersModule.formatCount);
    assertExists(formattersModule.formatPercentage);
    assertExists(formattersModule.formatPath);
  });
});

// Test status.ts
Deno.test("Status UI - module exports", async (t) => {
  await t.step("should export status display functions", async () => {
    const statusModule = await import("../../src/ui/status.ts");
    assertExists(statusModule.showStatus);
    assertExists(statusModule.showProgress);
    assertExists(statusModule.showSuccess);
    assertExists(statusModule.showError);
    assertExists(statusModule.showWarning);
  });
});

// Test resolver-utils.ts
Deno.test("Resolver Utils - basic functionality", async (t) => {
  await t.step("should export resolver utilities", async () => {
    const resolverModule = await import("../../src/lib/resolver-utils.ts");
    assertExists(resolverModule.resolveTagValue);
    assertExists(resolverModule.findMatchingTags);
    assertExists(resolverModule.getTaggedServers);
  });
});

// Test secrets manager
Deno.test("Secrets Manager - module structure", async (t) => {
  await t.step("should export secrets management", async () => {
    const secretsModule = await import("../../src/lib/secrets/manager.ts");
    assertExists(secretsModule.SecretsManager);
    assertEquals(typeof secretsModule.SecretsManager, "function");
  });
});

// Test encrypted storage
Deno.test("Encrypted Storage - exports", async (t) => {
  await t.step("should export storage functions", async () => {
    const storageModule = await import("../../src/lib/secrets/encrypted-storage.ts");
    assertExists(storageModule.EncryptedStorage);
    assertEquals(typeof storageModule.EncryptedStorage, "function");
  });
});

// Test nip46 utilities
Deno.test("NIP46 - basic exports", async (t) => {
  await t.step("should export NIP46 utilities", async () => {
    const nip46Module = await import("../../src/lib/nip46.ts");
    assertExists(nip46Module.parseBunkerUrl);
    assertExists(nip46Module.decodeBunkerInfo);
    assertExists(nip46Module.getNbunkString);
    assertExists(nip46Module.initiateNostrConnect);
  });
});

// Test command files
Deno.test("Commands - module exports", async (t) => {
  await t.step("should export download command", async () => {
    const downloadModule = await import("../../src/commands/download.ts");
    assertExists(downloadModule.registerDownloadCommand);
  });

  await t.step("should export ls command", async () => {
    const lsModule = await import("../../src/commands/ls.ts");
    assertExists(lsModule.registerLsCommand);
  });

  await t.step("should export upload command", async () => {
    const uploadModule = await import("../../src/commands/upload.ts");
    assertExists(uploadModule.registerUploadCommand);
  });

  await t.step("should export run command", async () => {
    const runModule = await import("../../src/commands/run.ts");
    assertExists(runModule.registerRunCommand);
  });
});

// Test CLI main
Deno.test("CLI - main entry point", async (t) => {
  await t.step("should have CLI structure", async () => {
    const cliModule = await import("../../src/cli.ts");
    assertExists(cliModule.main);
    assertEquals(typeof cliModule.main, "function");
  });
});

// Test version.ts
Deno.test("Version - exports", async (t) => {
  await t.step("should export version info", async () => {
    const versionModule = await import("../../src/version.ts");
    assertExists(versionModule.VERSION);
    assertExists(versionModule.getVersion);
    assertEquals(typeof versionModule.getVersion, "function");
  });
});