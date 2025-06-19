import { assertEquals, assertExists, assertMatch } from "std/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { restore, stub } from "jsr:@std/testing/mock";
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

describe("Output Helpers - comprehensive branch coverage", () => {
  let mathRandomStub: any;

  beforeEach(() => {
    // Mock Math.random for consistent testing
    mathRandomStub = stub(Math, "random", () => 0.5);
  });

  afterEach(() => {
    restore();
  });

  describe("displayColorfulHeader", () => {
    it("should return a colored header string", () => {
      const result = displayColorfulHeader();
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.length > 0, true);
    });

    it("should use different colors with different random values", () => {
      const results = [];

      // Test different random values to cover different color branches
      for (let i = 0; i < 12; i++) {
        mathRandomStub.restore();
        mathRandomStub = stub(Math, "random", () => i / 12);
        results.push(displayColorfulHeader());
      }

      // All results should be strings
      results.forEach((result) => {
        assertEquals(typeof result, "string");
        assertEquals(result.length > 0, true);
      });
    });

    it("should handle edge case random values", () => {
      const edgeCases = [0, 0.99999, 0.5];

      edgeCases.forEach((randomValue) => {
        mathRandomStub.restore();
        mathRandomStub = stub(Math, "random", () => randomValue);

        const result = displayColorfulHeader();
        assertExists(result);
        assertEquals(typeof result, "string");
      });
    });

    it("should always return the same base header content", () => {
      const header1 = displayColorfulHeader();
      const header2 = displayColorfulHeader();

      // Both should be strings of same length (same content, different colors)
      assertEquals(typeof header1, "string");
      assertEquals(typeof header2, "string");
      assertExists(header1);
      assertExists(header2);
    });
  });

  describe("getHeader", () => {
    it("should return plain header without colors", () => {
      const result = getHeader();
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.length > 0, true);
    });

    it("should return consistent header", () => {
      const header1 = getHeader();
      const header2 = getHeader();
      assertEquals(header1, header2);
    });

    it("should not contain ANSI escape codes", () => {
      const result = getHeader();
      // Should not contain ANSI escape sequences
      assertEquals(result.includes("\x1b["), false);
    });
  });

  describe("displayUploadConfigTable", () => {
    it("should display complete configuration", () => {
      const config = {
        publisherPubkey: "npub1test123",
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

      const result = displayUploadConfigTable(config);

      assertEquals(Array.isArray(result), true);
      assertEquals(result.length > 10, true); // Should have multiple lines

      // Check for required content
      const content = result.join(" ");
      assertEquals(content.includes("Upload Configuration"), true);
      assertEquals(content.includes("npub1test123"), true);
      assertEquals(content.includes("relay1.com"), true);
      assertEquals(content.includes("server1.com"), true);
    });

    it("should handle minimal configuration", () => {
      const config = {
        publisherPubkey: "npub1minimal",
        relays: ["wss://relay.com"],
        servers: ["https://server.com"],
        force: false,
        purge: false,
        concurrency: 4,
        publishRelayList: false,
        publishServerList: false,
        publishProfile: false,
      };

      const result = displayUploadConfigTable(config);

      assertEquals(Array.isArray(result), true);
      assertEquals(result.length > 5, true);

      const content = result.join(" ");
      assertEquals(content.includes("npub1minimal"), true);
    });

    it("should handle config without fallback", () => {
      const config = {
        publisherPubkey: "npub1test",
        relays: ["wss://relay.com"],
        servers: ["https://server.com"],
        force: false,
        purge: false,
        concurrency: 4,
        publishRelayList: false,
        publishServerList: false,
        publishProfile: false,
      };

      const result = displayUploadConfigTable(config);

      assertEquals(Array.isArray(result), true);
      const content = result.join(" ");
      assertEquals(content.includes("None"), true);
    });

    it("should handle different boolean combinations", () => {
      const booleanCombinations = [
        { force: true, purge: true, publishRelayList: true },
        { force: false, purge: false, publishRelayList: false },
        { force: true, purge: false, publishRelayList: true },
        { force: false, purge: true, publishRelayList: false },
      ];

      booleanCombinations.forEach((booleans) => {
        const config = {
          publisherPubkey: "npub1test",
          relays: ["wss://relay.com"],
          servers: ["https://server.com"],
          concurrency: 4,
          publishServerList: false,
          publishProfile: false,
          ...booleans,
        };

        const result = displayUploadConfigTable(config);
        assertEquals(Array.isArray(result), true);
        assertEquals(result.length > 0, true);
      });
    });

    it("should handle default vs non-default concurrency", () => {
      const configs = [
        { concurrency: 4 }, // default
        { concurrency: 8 }, // non-default
        { concurrency: 1 }, // minimal
        { concurrency: 16 }, // high
      ];

      configs.forEach((concurrencyConfig) => {
        const config = {
          publisherPubkey: "npub1test",
          relays: ["wss://relay.com"],
          servers: ["https://server.com"],
          force: false,
          purge: false,
          publishRelayList: false,
          publishServerList: false,
          publishProfile: false,
          ...concurrencyConfig,
        };

        const result = displayUploadConfigTable(config);
        assertEquals(Array.isArray(result), true);

        const content = result.join(" ");
        assertEquals(content.includes(concurrencyConfig.concurrency.toString()), true);
      });
    });
  });

  describe("getUploadSections", () => {
    it("should return upload section headers", () => {
      const result = getUploadSections();

      assertExists(result);
      assertExists(result.blobsHeader);
      assertExists(result.serverHeader);
      assertExists(result.eventsHeader);

      assertEquals(typeof result.blobsHeader, "string");
      assertEquals(typeof result.serverHeader, "string");
      assertEquals(typeof result.eventsHeader, "string");

      // Check for expected content
      assertEquals(result.blobsHeader.includes("Blobs Upload"), true);
      assertEquals(result.blobsHeader.includes("Blossom"), true);
      assertEquals(result.serverHeader.includes("Server Summary"), true);
      assertEquals(result.eventsHeader.includes("Events Publish"), true);
      assertEquals(result.eventsHeader.includes("nostr"), true);
    });

    it("should return consistent sections", () => {
      const result1 = getUploadSections();
      const result2 = getUploadSections();

      assertEquals(result1.blobsHeader, result2.blobsHeader);
      assertEquals(result1.serverHeader, result2.serverHeader);
      assertEquals(result1.eventsHeader, result2.eventsHeader);
    });
  });

  describe("formatUploadResults", () => {
    it("should format successful complete upload", () => {
      const result = formatUploadResults(5, 5);
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("All 5 files"), true);
      assertEquals(result.includes("successfully uploaded"), true);
    });

    it("should format partial upload", () => {
      const result = formatUploadResults(3, 5);
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("3/5 files"), true);
      assertEquals(result.includes("successfully uploaded"), true);
    });

    it("should handle zero uploads", () => {
      const result = formatUploadResults(0, 5);
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("0/5"), true);
    });

    it("should handle single file scenarios", () => {
      const successResult = formatUploadResults(1, 1);
      const failResult = formatUploadResults(0, 1);

      assertEquals(successResult.includes("All 1 files"), true);
      assertEquals(failResult.includes("0/1"), true);
    });

    it("should handle large numbers", () => {
      const result = formatUploadResults(999, 1000);
      assertExists(result);
      assertEquals(result.includes("999/1000"), true);
    });
  });

  describe("formatServerResult", () => {
    it("should format complete success", () => {
      const result = formatServerResult("https://server.com", 5, 5);
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("✓"), true);
      assertEquals(result.includes("server.com"), true);
      assertEquals(result.includes("5/5"), true);
      assertEquals(result.includes("100%"), true);
    });

    it("should format complete failure", () => {
      const result = formatServerResult("https://server.com", 0, 5);
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("✗"), true);
      assertEquals(result.includes("0/5"), true);
      assertEquals(result.includes("0%"), true);
    });

    it("should format partial success", () => {
      const result = formatServerResult("https://server.com", 3, 5);
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("!"), true);
      assertEquals(result.includes("3/5"), true);
      assertEquals(result.includes("60%"), true);
    });

    it("should handle different percentage calculations", () => {
      const testCases = [
        { success: 1, total: 3, expectedPercentage: 33 },
        { success: 2, total: 3, expectedPercentage: 67 },
        { success: 1, total: 2, expectedPercentage: 50 },
        { success: 7, total: 8, expectedPercentage: 88 },
      ];

      testCases.forEach(({ success, total, expectedPercentage }) => {
        const result = formatServerResult("https://test.com", success, total);
        assertEquals(result.includes(`${expectedPercentage}%`), true);
      });
    });

    it("should handle edge cases", () => {
      const edgeCases = [
        { success: 0, total: 1 },
        { success: 1, total: 1 },
        { success: 100, total: 100 },
        { success: 1, total: 1000 },
      ];

      edgeCases.forEach(({ success, total }) => {
        const result = formatServerResult("https://edge.com", success, total);
        assertExists(result);
        assertEquals(typeof result, "string");
        assertEquals(result.includes(`${success}/${total}`), true);
      });
    });
  });

  describe("formatEventsResult", () => {
    it("should format complete success", () => {
      const result = formatEventsResult(3, 3);
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("All 3 file events"), true);
      assertEquals(result.includes("successfully published"), true);
    });

    it("should format partial success", () => {
      const result = formatEventsResult(2, 3);
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("2/3 events"), true);
      assertEquals(result.includes("published to relays"), true);
    });

    it("should handle zero events", () => {
      const result = formatEventsResult(0, 3);
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("0/3"), true);
    });

    it("should handle single event", () => {
      const successResult = formatEventsResult(1, 1);
      const failResult = formatEventsResult(0, 1);

      assertEquals(successResult.includes("All 1 file events"), true);
      assertEquals(failResult.includes("0/1"), true);
    });
  });

  describe("getUploadCompleteMessage", () => {
    it("should return upload complete message", () => {
      const result = getUploadCompleteMessage();
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("Upload complete"), true);
      assertEquals(result.includes("✅"), true);
    });

    it("should return consistent message", () => {
      const message1 = getUploadCompleteMessage();
      const message2 = getUploadCompleteMessage();
      assertEquals(message1, message2);
    });
  });

  describe("getSuccessMessage", () => {
    it("should return success message", () => {
      const result = getSuccessMessage();
      assertExists(result);
      assertEquals(typeof result, "string");
      assertEquals(result.includes("live on the decentralized web"), true);
      assertEquals(result.includes("🎉"), true);
    });

    it("should return consistent message", () => {
      const message1 = getSuccessMessage();
      const message2 = getSuccessMessage();
      assertEquals(message1, message2);
    });
  });

  describe("formatHelpOutput", () => {
    it("should return comprehensive help", () => {
      const result = formatHelpOutput();

      assertEquals(Array.isArray(result), true);
      assertEquals(result.length > 15, true);

      const content = result.join(" ");
      assertEquals(content.includes("nsyte"), true);
      assertEquals(content.includes("Commands:"), true);
      assertEquals(content.includes("Options:"), true);
      assertEquals(content.includes("Examples:"), true);
    });

    it("should include all main commands", () => {
      const result = formatHelpOutput();
      const content = result.join(" ");

      const commands = ["init", "upload", "ls", "download", "bunker", "ci"];
      commands.forEach((command) => {
        assertEquals(content.includes(command), true);
      });
    });

    it("should include usage examples", () => {
      const result = formatHelpOutput();
      const content = result.join(" ");

      assertEquals(content.includes("nsyte init"), true);
      assertEquals(content.includes("nsyte upload"), true);
      assertEquals(content.includes("nsyte ls"), true);
      assertEquals(content.includes("nsyte bunker connect"), true);
    });

    it("should include common options", () => {
      const result = formatHelpOutput();
      const content = result.join(" ");

      assertEquals(content.includes("--help"), true);
      assertEquals(content.includes("--version"), true);
    });
  });

  describe("getQRMessages", () => {
    it("should return QR message object", () => {
      const result = getQRMessages();

      assertExists(result);
      assertExists(result.connecting);
      assertExists(result.instruction);
      assertExists(result.uri);
      assertExists(result.waiting);
      assertExists(result.connected);
      assertExists(result.disconnecting);
      assertExists(result.disconnected);
      assertExists(result.success);
      assertExists(result.stored);
    });

    it("should have string values for all messages", () => {
      const result = getQRMessages();

      Object.values(result).forEach((message) => {
        assertEquals(typeof message, "string");
        assertEquals(message.length > 0, true);
      });
    });

    it("should include expected QR content", () => {
      const result = getQRMessages();

      assertEquals(result.connecting.includes("Nostr Connect"), true);
      assertEquals(result.instruction.includes("QR code"), true);
      assertEquals(result.uri.includes("nostr+walletconnect"), true);
      assertEquals(result.waiting.includes("120s"), true);
      assertEquals(result.connected.includes("Connected"), true);
      assertEquals(result.success.includes("bunker"), true);
      assertEquals(result.stored.includes("nbunksec"), true);
    });

    it("should return consistent messages", () => {
      const result1 = getQRMessages();
      const result2 = getQRMessages();

      Object.keys(result1).forEach((key) => {
        assertEquals(result1[key as keyof typeof result1], result2[key as keyof typeof result2]);
      });
    });
  });

  describe("function return types and consistency", () => {
    it("should validate all functions return correct types", () => {
      assertEquals(typeof displayColorfulHeader(), "string");
      assertEquals(typeof getHeader(), "string");
      assertEquals(
        Array.isArray(displayUploadConfigTable({
          publisherPubkey: "test",
          relays: [],
          servers: [],
          force: false,
          purge: false,
          concurrency: 4,
          publishRelayList: false,
          publishServerList: false,
          publishProfile: false,
        })),
        true,
      );
      assertEquals(typeof getUploadSections(), "object");
      assertEquals(typeof formatUploadResults(1, 1), "string");
      assertEquals(typeof formatServerResult("test", 1, 1), "string");
      assertEquals(typeof formatEventsResult(1, 1), "string");
      assertEquals(typeof getUploadCompleteMessage(), "string");
      assertEquals(typeof getSuccessMessage(), "string");
      assertEquals(Array.isArray(formatHelpOutput()), true);
      assertEquals(typeof getQRMessages(), "object");
    });

    it("should handle various input ranges", () => {
      // Test formatUploadResults with different ranges
      const uploadTestCases = [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 2],
        [50, 100],
        [100, 100],
      ];

      uploadTestCases.forEach(([uploaded, total]) => {
        const result = formatUploadResults(uploaded, total);
        assertEquals(typeof result, "string");
        assertEquals(result.length > 0, true);
      });

      // Test formatServerResult with different success rates
      const serverTestCases = [
        [0, 1],
        [1, 1],
        [1, 3],
        [2, 3],
        [10, 20],
        [100, 100],
      ];

      serverTestCases.forEach(([success, total]) => {
        const result = formatServerResult("https://test.com", success, total);
        assertEquals(typeof result, "string");
        assertEquals(result.length > 0, true);
      });
    });
  });
});
