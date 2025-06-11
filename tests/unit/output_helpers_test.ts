import { assert, assertEquals, assertExists } from "std/assert/mod.ts";
import { restore, stub } from "std/testing/mock.ts";
import {
  displayColorfulHeader,
  displayUploadConfigTable,
  formatEventsResult,
  formatHelpOutput,
  formatServerResult,
  formatUploadResults,
  getHeader,
  getQRMessages,
  getSuccessMessage,
  getUploadCompleteMessage,
  getUploadSections,
} from "../../src/ui/output-helpers.ts";

Deno.test("Output Helpers - Header Functions", async (t) => {
  await t.step("should display colorful header", () => {
    const colorfulHeader = displayColorfulHeader();

    assertExists(colorfulHeader);
    assertEquals(typeof colorfulHeader, "string");
    assert(colorfulHeader.length > 0);
    // Header should contain ANSI color codes
    assert(colorfulHeader.includes("\x1b["));
  });

  await t.step("should get header without colors", () => {
    const plainHeader = getHeader();

    assertExists(plainHeader);
    assertEquals(typeof plainHeader, "string");
    assert(plainHeader.length > 0);
    // Should not contain ANSI color codes
    assert(!plainHeader.includes("\x1b["));
  });

  await t.step("should return consistent header content", () => {
    const colorfulHeader = displayColorfulHeader();
    const plainHeader = getHeader();

    // Remove ANSI codes from colorful header for comparison
    const strippedHeader = colorfulHeader.replace(/\x1b\[[0-9;]*m/g, "");
    assertEquals(strippedHeader, plainHeader);
  });
});

Deno.test("Output Helpers - Upload Configuration", async (t) => {
  await t.step("should display upload config table with all options", () => {
    const config = {
      publisherPubkey: "npub1testpubkey",
      relays: ["wss://relay1.com", "wss://relay2.com"],
      servers: ["https://server1.com", "https://server2.com"],
      force: true,
      purge: false,
      concurrency: 8,
      fallback: "index.html",
      publishRelayList: true,
      publishServerList: false,
      publishProfile: true,
    };

    const lines = displayUploadConfigTable(config);

    assertExists(lines);
    assert(Array.isArray(lines));
    assert(lines.length > 0);

    const content = lines.join("\n");
    assert(content.includes("Upload Configuration"));
    assert(content.includes("npub1testpubkey"));
    assert(content.includes("relay1.com"));
    assert(content.includes("server1.com"));
    assert(content.includes("index.html"));
  });

  await t.step("should handle missing fallback option", () => {
    const config = {
      publisherPubkey: "npub1test",
      relays: ["wss://relay1.com"],
      servers: ["https://server1.com"],
      force: false,
      purge: false,
      concurrency: 4,
      publishRelayList: false,
      publishServerList: false,
      publishProfile: false,
    };

    const lines = displayUploadConfigTable(config);
    const content = lines.join("\n");

    assert(content.includes("None"));
  });

  await t.step("should format boolean values correctly", () => {
    const config = {
      publisherPubkey: "npub1test",
      relays: [],
      servers: [],
      force: true,
      purge: true,
      concurrency: 4,
      publishRelayList: true,
      publishServerList: true,
      publishProfile: true,
    };

    const lines = displayUploadConfigTable(config);
    const content = lines.join("\n");

    assert(content.includes("Yes"));
  });
});

Deno.test("Output Helpers - Upload Sections", async (t) => {
  await t.step("should return formatted section headers", () => {
    const sections = getUploadSections();

    assertExists(sections.blobsHeader);
    assertExists(sections.serverHeader);
    assertExists(sections.eventsHeader);

    assert(sections.blobsHeader.includes("Blobs Upload Results"));
    assert(sections.blobsHeader.includes("🌸"));
    assert(sections.serverHeader.includes("Blossom Server Summary"));
    assert(sections.eventsHeader.includes("Nsite Events Publish Results"));
    assert(sections.eventsHeader.includes("𓅦"));
  });
});

Deno.test("Output Helpers - Result Formatting", async (t) => {
  await t.step("should format complete upload results", () => {
    const result = formatUploadResults(5, 5);

    assert(result.includes("✓"));
    assert(result.includes("All 5 files"));
    assert(result.includes("successfully uploaded"));
  });

  await t.step("should format partial upload results", () => {
    const result = formatUploadResults(3, 5);

    assert(result.includes("3/5"));
    assert(result.includes("successfully uploaded"));
  });

  await t.step("should format server results with full success", () => {
    const result = formatServerResult("https://example.com", 10, 10);

    assert(result.includes("✓"));
    assert(result.includes("https://example.com"));
    assert(result.includes("10/10"));
    assert(result.includes("100%"));
  });

  await t.step("should format server results with partial success", () => {
    const result = formatServerResult("https://example.com", 7, 10);

    assert(result.includes("!"));
    assert(result.includes("7/10"));
    assert(result.includes("70%"));
  });

  await t.step("should format server results with no success", () => {
    const result = formatServerResult("https://example.com", 0, 10);

    assert(result.includes("✗"));
    assert(result.includes("0/10"));
    assert(result.includes("0%"));
  });

  await t.step("should format complete events results", () => {
    const result = formatEventsResult(3, 3);

    assert(result.includes("✓"));
    assert(result.includes("All 3"));
    assert(result.includes("successfully published"));
  });

  await t.step("should format partial events results", () => {
    const result = formatEventsResult(2, 3);

    assert(result.includes("2/3"));
    assert(result.includes("published to relays"));
  });
});

Deno.test("Output Helpers - Message Functions", async (t) => {
  await t.step("should return upload complete message", () => {
    const message = getUploadCompleteMessage();

    assertExists(message);
    assert(message.includes("✅"));
    assert(message.includes("Upload complete"));
  });

  await t.step("should return success message", () => {
    const message = getSuccessMessage();

    assertExists(message);
    assert(message.includes("🎉"));
    assert(message.includes("decentralized web"));
  });
});

Deno.test("Output Helpers - Help Output", async (t) => {
  await t.step("should format comprehensive help output", () => {
    const lines = formatHelpOutput();

    assertExists(lines);
    assert(Array.isArray(lines));
    assert(lines.length > 10);

    const content = lines.join("\n");
    assert(content.includes("nsyte"));
    assert(content.includes("Commands:"));
    assert(content.includes("init"));
    assert(content.includes("upload"));
    assert(content.includes("download"));
    assert(content.includes("bunker"));
    assert(content.includes("Options:"));
    assert(content.includes("Examples:"));
  });

  await t.step("should include all core commands in help", () => {
    const lines = formatHelpOutput();
    const content = lines.join("\n");

    assert(content.includes("init"));
    assert(content.includes("upload"));
    assert(content.includes("ls"));
    assert(content.includes("download"));
    assert(content.includes("bunker"));
    assert(content.includes("ci"));
  });

  await t.step("should include usage examples", () => {
    const lines = formatHelpOutput();
    const content = lines.join("\n");

    assert(content.includes("nsyte init"));
    assert(content.includes("nsyte upload"));
    assert(content.includes("nsyte ls"));
    assert(content.includes("nsyte bunker"));
  });
});

Deno.test("Output Helpers - QR Messages", async (t) => {
  await t.step("should return all QR message types", () => {
    const messages = getQRMessages();

    assertExists(messages.connecting);
    assertExists(messages.instruction);
    assertExists(messages.uri);
    assertExists(messages.waiting);
    assertExists(messages.connected);
    assertExists(messages.disconnecting);
    assertExists(messages.disconnected);
    assertExists(messages.success);
    assertExists(messages.stored);
  });

  await t.step("should include proper QR message content", () => {
    const messages = getQRMessages();

    assert(messages.connecting.includes("Nostr Connect"));
    assert(messages.instruction.includes("scan the QR code"));
    assert(messages.uri.includes("nostr+walletconnect://"));
    assert(messages.waiting.includes("120s"));
    assert(messages.connected.includes("✓"));
    assert(messages.success.includes("Successfully connected"));
    assert(messages.stored.includes("nbunksec"));
  });

  await t.step("should format status messages with colors", () => {
    const messages = getQRMessages();

    // Check for ANSI color codes in appropriate messages
    assert(messages.connecting.includes("\x1b["));
    assert(messages.connected.includes("\x1b["));
    assert(messages.success.includes("\x1b["));
  });
});

Deno.test("Output Helpers - Edge Cases", async (t) => {
  await t.step("should handle zero values in results", () => {
    const uploadResult = formatUploadResults(0, 0);
    const serverResult = formatServerResult("test.com", 0, 0);
    const eventsResult = formatEventsResult(0, 0);

    assertExists(uploadResult);
    assertExists(serverResult);
    assertExists(eventsResult);

    // Should handle division by zero gracefully
    assert(serverResult.includes("0/0"));
  });

  await t.step("should handle empty arrays in config", () => {
    const config = {
      publisherPubkey: "",
      relays: [],
      servers: [],
      force: false,
      purge: false,
      concurrency: 1,
      publishRelayList: false,
      publishServerList: false,
      publishProfile: false,
    };

    const lines = displayUploadConfigTable(config);
    assertExists(lines);
    assert(lines.length > 0);
  });

  await t.step("should handle very long server URLs", () => {
    const longUrl = "https://very-long-server-name-that-might-break-formatting.example.com";
    const result = formatServerResult(longUrl, 5, 10);

    assertExists(result);
    assert(result.includes(longUrl));
    assert(result.includes("5/10"));
  });
});
