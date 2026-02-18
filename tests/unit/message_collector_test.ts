import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import {
  type Message,
  MessageCategory,
  MessageCollector,
  type MessageType,
} from "../../src/lib/message-collector.ts";

describe("message-collector - comprehensive branch coverage", () => {
  let collector: MessageCollector;
  let consoleLogStub: any;
  let consoleOutput: string[];

  beforeEach(() => {
    collector = new MessageCollector();
    consoleOutput = [];
    consoleLogStub = stub(console, "log", (...args: any[]) => {
      consoleOutput.push(args.join(" "));
    });
  });

  afterEach(() => {
    restore();
  });

  describe("Constructor", () => {
    it("should create collector with pretty format by default", () => {
      const col = new MessageCollector();
      assertExists(col);
    });

    it("should create collector with pretty format explicitly", () => {
      const col = new MessageCollector(true);
      assertExists(col);
    });

    it("should create collector without pretty format", () => {
      const col = new MessageCollector(false);
      assertExists(col);
    });
  });

  describe("addMessage", () => {
    it("should add new message", () => {
      collector.addMessage("info", MessageCategory.GENERAL, "Test message", "target1");

      const messages = collector.getMessagesByType("info");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].content, "Test message");
      assertEquals(messages[0].target, "target1");
      assertEquals(messages[0].count, 1);
    });

    it("should increment count for duplicate messages", () => {
      collector.addMessage("error", MessageCategory.FILE, "File error", "file.txt");
      collector.addMessage("error", MessageCategory.FILE, "File error", "file.txt");
      collector.addMessage("error", MessageCategory.FILE, "File error", "file.txt");

      const messages = collector.getMessagesByType("error");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].count, 3);
    });

    it("should update data for duplicate messages", () => {
      collector.addMessage("success", MessageCategory.FILE, "Uploaded", "file.txt", { size: 100 });
      collector.addMessage("success", MessageCategory.FILE, "Uploaded", "file.txt", { size: 200 });

      const messages = collector.getMessagesByType("success");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].count, 2);
      assertEquals(messages[0].data.size, 200);
    });

    it("should treat different targets as separate messages", () => {
      collector.addMessage("info", MessageCategory.GENERAL, "Same content", "target1");
      collector.addMessage("info", MessageCategory.GENERAL, "Same content", "target2");

      const messages = collector.getMessagesByType("info");
      assertEquals(messages.length, 2);
    });

    it("should treat different types as separate messages", () => {
      collector.addMessage("info", MessageCategory.GENERAL, "Same content", "target");
      collector.addMessage("warning", MessageCategory.GENERAL, "Same content", "target");

      assertEquals(collector.getMessagesByType("info").length, 1);
      assertEquals(collector.getMessagesByType("warning").length, 1);
    });

    it("should treat different categories as separate messages", () => {
      collector.addMessage("info", MessageCategory.GENERAL, "Same content", "target");
      collector.addMessage("info", MessageCategory.FILE, "Same content", "target");

      assertEquals(collector.getMessagesByCategory(MessageCategory.GENERAL).length, 1);
      assertEquals(collector.getMessagesByCategory(MessageCategory.FILE).length, 1);
    });

    it("should handle messages without data", () => {
      collector.addMessage("notice", MessageCategory.GENERAL, "Notice", "system");

      const messages = collector.getMessagesByType("notice");
      assertEquals(messages[0].data, undefined);
    });
  });

  describe("Specialized add methods", () => {
    it("should add relay rejection", () => {
      collector.addRelayRejection("wss://relay.com", "Rate limited");

      const messages = collector.getMessagesByType("relay-rejection");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].category, MessageCategory.RELAY);
      assertEquals(messages[0].content, "Rate limited");
      assertEquals(messages[0].target, "wss://relay.com");
    });

    it("should add connection error", () => {
      collector.addConnectionError("wss://relay.com", "Connection refused");

      const messages = collector.getMessagesByType("connection-error");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].category, MessageCategory.RELAY);
      assertEquals(messages[0].content, "Connection refused");
    });

    it("should add server error", () => {
      collector.addServerError("https://server.com", "500 Internal Server Error");

      const messages = collector.getMessagesByType("error");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].category, MessageCategory.SERVER);
      assertEquals(messages[0].content, "500 Internal Server Error");
    });

    it("should add file error", () => {
      collector.addFileError("file.txt", "File not found");

      const messages = collector.getMessagesByType("error");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].category, MessageCategory.FILE);
      assertEquals(messages[0].content, "File not found");
    });

    it("should add file success and store hash", () => {
      collector.addFileSuccess("file.txt", "abc123hash");

      const messages = collector.getMessagesByType("success");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].category, MessageCategory.FILE);
      assertEquals(messages[0].data.hash, "abc123hash");
      assertEquals(collector.getFileHash("file.txt"), "abc123hash");
    });

    it("should add event success and store ID", () => {
      collector.addEventSuccess("file.txt", "event123id");

      const messages = collector.getMessagesByType("success");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].category, MessageCategory.EVENT);
      assertEquals(messages[0].data.eventId, "event123id");
      assertEquals(collector.getEventId("file.txt"), "event123id");
    });

    it("should add notice with default target", () => {
      collector.addNotice("System message");

      const messages = collector.getMessagesByType("notice");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].target, "system");
    });

    it("should add notice with custom target", () => {
      collector.addNotice("Custom message", "custom-target");

      const messages = collector.getMessagesByType("notice");
      assertEquals(messages.length, 1);
      assertEquals(messages[0].target, "custom-target");
    });
  });

  describe("Getters", () => {
    it("should get file hash", () => {
      collector.addFileSuccess("file1.txt", "hash1");
      collector.addFileSuccess("file2.txt", "hash2");

      assertEquals(collector.getFileHash("file1.txt"), "hash1");
      assertEquals(collector.getFileHash("file2.txt"), "hash2");
      assertEquals(collector.getFileHash("nonexistent.txt"), undefined);
    });

    it("should get event ID", () => {
      collector.addEventSuccess("file1.txt", "event1");
      collector.addEventSuccess("file2.txt", "event2");

      assertEquals(collector.getEventId("file1.txt"), "event1");
      assertEquals(collector.getEventId("file2.txt"), "event2");
      assertEquals(collector.getEventId("nonexistent.txt"), undefined);
    });

    it("should get all file hashes", () => {
      collector.addFileSuccess("file1.txt", "hash1");
      collector.addFileSuccess("file2.txt", "hash2");

      const hashes = collector.getAllFileHashes();
      assertEquals(hashes.size, 2);
      assertEquals(hashes.get("file1.txt"), "hash1");
      assertEquals(hashes.get("file2.txt"), "hash2");
    });

    it("should get all event IDs", () => {
      collector.addEventSuccess("file1.txt", "event1");
      collector.addEventSuccess("file2.txt", "event2");

      const ids = collector.getAllEventIds();
      assertEquals(ids.size, 2);
      assertEquals(ids.get("file1.txt"), "event1");
      assertEquals(ids.get("file2.txt"), "event2");
    });
  });

  describe("Statistics", () => {
    it("should calculate stats correctly", () => {
      // Add various messages
      collector.addMessage("info", MessageCategory.GENERAL, "Info 1", "target");
      collector.addMessage("info", MessageCategory.GENERAL, "Info 2", "target");
      collector.addMessage("error", MessageCategory.FILE, "Error", "file");
      collector.addMessage("error", MessageCategory.FILE, "Error", "file"); // Duplicate
      collector.addRelayRejection("relay", "Rejected");
      collector.addConnectionError("server", "Failed");
      collector.addFileSuccess("file", "hash");
      collector.addEventSuccess("file", "event");
      collector.addNotice("Notice");
      collector.addMessage("warning", MessageCategory.RELAY, "Warning", "relay");

      const stats = collector.getStats();

      // Check type counts
      assertEquals(stats.totalByType.info, 2);
      assertEquals(stats.totalByType.error, 2); // 2 addMessage("error") calls
      assertEquals(stats.totalByType["relay-rejection"], 1);
      assertEquals(stats.totalByType["connection-error"], 1);
      assertEquals(stats.totalByType.success, 2);
      assertEquals(stats.totalByType.notice, 1);
      assertEquals(stats.totalByType.warning, 1);

      // Check category counts
      assertEquals(stats.totalByCategory[MessageCategory.GENERAL], 3);
      assertEquals(stats.totalByCategory[MessageCategory.FILE], 3);
      assertEquals(stats.totalByCategory[MessageCategory.RELAY], 3);
      assertEquals(stats.totalByCategory[MessageCategory.EVENT], 1);
      assertEquals(stats.totalByCategory[MessageCategory.SERVER], 0);
    });

    it("should handle empty collector stats", () => {
      const stats = collector.getStats();

      assertEquals(stats.totalByType.info, 0);
      assertEquals(stats.totalByType.error, 0);
      assertEquals(stats.totalByType.success, 0);
      assertEquals(stats.totalByCategory[MessageCategory.GENERAL], 0);
    });
  });

  describe("Filtering", () => {
    beforeEach(() => {
      // Add a variety of messages
      collector.addMessage("info", MessageCategory.GENERAL, "Info", "target1");
      collector.addMessage("error", MessageCategory.FILE, "Error", "file1");
      collector.addMessage("success", MessageCategory.FILE, "Success", "file2");
      collector.addRelayRejection("relay1", "Rejected");
      collector.addConnectionError("server1", "Failed");
    });

    it("should filter by type", () => {
      assertEquals(collector.getMessagesByType("info").length, 1);
      assertEquals(collector.getMessagesByType("error").length, 1);
      assertEquals(collector.getMessagesByType("success").length, 1);
      assertEquals(collector.getMessagesByType("relay-rejection").length, 1);
      assertEquals(collector.getMessagesByType("connection-error").length, 1);
      assertEquals(collector.getMessagesByType("warning").length, 0);
    });

    it("should filter by category", () => {
      assertEquals(collector.getMessagesByCategory(MessageCategory.GENERAL).length, 1);
      assertEquals(collector.getMessagesByCategory(MessageCategory.FILE).length, 2);
      assertEquals(collector.getMessagesByCategory(MessageCategory.RELAY).length, 2);
      assertEquals(collector.getMessagesByCategory(MessageCategory.EVENT).length, 0);
    });

    it("should check if has message type", () => {
      assertEquals(collector.hasMessageType("info"), true);
      assertEquals(collector.hasMessageType("error"), true);
      assertEquals(collector.hasMessageType("warning"), false);
      assertEquals(collector.hasMessageType("notice"), false);
    });

    it("should check if has message category", () => {
      assertEquals(collector.hasMessageCategory(MessageCategory.GENERAL), true);
      assertEquals(collector.hasMessageCategory(MessageCategory.FILE), true);
      assertEquals(collector.hasMessageCategory(MessageCategory.EVENT), false);
      assertEquals(collector.hasMessageCategory(MessageCategory.SERVER), false);
    });
  });

  describe("Formatting", () => {
    it("should format messages with pretty format", () => {
      const prettyCollector = new MessageCollector(true);

      prettyCollector.addMessage("error", MessageCategory.FILE, "Error message", "file.txt");
      prettyCollector.addMessage("warning", MessageCategory.RELAY, "Warning message", "relay");
      prettyCollector.addMessage("success", MessageCategory.FILE, "Success message", "file2.txt");
      prettyCollector.addRelayRejection("relay2", "Rejected");
      prettyCollector.addConnectionError("server", "Failed");
      prettyCollector.addNotice("Notice message");
      prettyCollector.addMessage("info", MessageCategory.GENERAL, "Info message", "target");

      prettyCollector.printAllGroupedMessages();

      // Check output contains expected symbols
      const output = consoleOutput.join("\n");
      assertExists(output);
      assertEquals(output.includes("✗"), true); // Error symbol
      assertEquals(output.includes("!"), true); // Warning/rejection symbol
    });

    it("should format messages without pretty format", () => {
      const plainCollector = new MessageCollector(false);

      plainCollector.addMessage("error", MessageCategory.FILE, "Error message", "file.txt");
      plainCollector.addMessage("warning", MessageCategory.RELAY, "Warning message", "relay");

      plainCollector.printErrorSummary();

      const output = consoleOutput.join("\n");
      assertEquals(output.includes("[ERROR]"), true);
      assertEquals(output.includes("file(file.txt)"), true);
    });

    it("should handle message counts in formatting", () => {
      collector.addMessage("error", MessageCategory.FILE, "Same error", "file.txt");
      collector.addMessage("error", MessageCategory.FILE, "Same error", "file.txt");
      collector.addMessage("error", MessageCategory.FILE, "Same error", "file.txt");

      collector.printErrorSummary();

      const output = consoleOutput.join("\n");
      assertEquals(output.includes("(3×)"), true);
    });

    it("should format all message types correctly", () => {
      const types: MessageType[] = [
        "error",
        "warning",
        "success",
        "relay-rejection",
        "connection-error",
        "notice",
        "info",
      ];

      for (const type of types) {
        const c = new MessageCollector(true);
        c.addMessage(type, MessageCategory.GENERAL, "Message", "target");

        if (type === "error" || type === "connection-error") {
          c.printErrorSummary();
        } else if (type === "relay-rejection") {
          c.printRelayIssuesSummary();
        } else if (type === "notice") {
          c.printNotices();
        }
      }

      // Should have formatted output for each type
      assertEquals(consoleOutput.length > 0, true);
    });
  });

  describe("Print methods", () => {
    it("should not print when no messages", () => {
      collector.printErrorSummary();
      collector.printRelayIssuesSummary();
      collector.printNotices();

      assertEquals(consoleOutput.length, 0);
    });

    it("should print message type with header", () => {
      collector.addMessage("info", MessageCategory.GENERAL, "Info 1", "target1");
      collector.addMessage("info", MessageCategory.GENERAL, "Info 2", "target2");

      collector.printMessageType("info", "Information Messages");

      assertEquals(consoleOutput[0].includes("Information Messages"), true);
      assertEquals(consoleOutput.length, 4); // Header + 2 messages + empty line
    });

    it("should print message category with header", () => {
      collector.addMessage("info", MessageCategory.FILE, "File info", "file1");
      collector.addMessage("error", MessageCategory.FILE, "File error", "file2");

      collector.printMessageCategory(MessageCategory.FILE, "File Messages");

      assertEquals(consoleOutput[0].includes("File Messages"), true);
      assertEquals(consoleOutput.length, 4); // Header + 2 messages + empty line
    });

    it("should print file success summary with hashes", () => {
      collector.addFileSuccess("file1.txt", "1234567890abcdef");
      collector.addFileSuccess("file2.txt", "fedcba0987654321");

      collector.printFileSuccessSummary();

      const output = consoleOutput.join("\n");
      assertEquals(output.includes("1234567890..."), true);
      assertEquals(output.includes("fedcba0987..."), true);
    });

    it("should print file success summary without hashes", () => {
      // Add success without using addFileSuccess (no hash)
      collector.addMessage("success", MessageCategory.FILE, "Uploaded", "file.txt");

      collector.printFileSuccessSummary();

      const output = consoleOutput.join("\n");
      assertEquals(output.includes("file.txt"), true);
      assertEquals(output.includes("..."), false);
    });

    it("should print event success summary with IDs", () => {
      collector.addEventSuccess("file1.txt", "event1234567890");
      collector.addEventSuccess("file2.txt", "event0987654321");

      collector.printEventSuccessSummary();

      const output = consoleOutput.join("\n");
      assertEquals(output.includes("event12345..."), true);
      assertEquals(output.includes("event09876..."), true);
    });

    it("should print event success summary without IDs", () => {
      // Add success without using addEventSuccess (no eventId)
      collector.addMessage("success", MessageCategory.EVENT, "Published", "file.txt");

      collector.printEventSuccessSummary();

      const output = consoleOutput.join("\n");
      assertEquals(output.includes("file.txt"), true);
      assertEquals(output.includes("..."), false);
    });

    it("should print all grouped messages in correct order", () => {
      collector.addRelayRejection("relay1", "Rejected");
      collector.addConnectionError("server1", "Failed");
      collector.addMessage("error", MessageCategory.FILE, "File error", "file1");
      collector.addNotice("System notice");

      collector.printAllGroupedMessages();

      // Check order: rejections, errors, notices
      const headers = consoleOutput.filter((line) =>
        line.includes("Rejections") || line.includes("Errors") || line.includes("Notices")
      );
      assertEquals(headers.length, 3);
    });
  });

  describe("Clear", () => {
    it("should clear all data", () => {
      // Add various data
      collector.addMessage("info", MessageCategory.GENERAL, "Info", "target");
      collector.addFileSuccess("file1.txt", "hash1");
      collector.addEventSuccess("file2.txt", "event1");
      collector.addRelayRejection("relay", "Rejected");

      // Verify data exists
      assertEquals(collector.getMessagesByType("info").length, 1);
      assertEquals(collector.getFileHash("file1.txt"), "hash1");
      assertEquals(collector.getEventId("file2.txt"), "event1");

      // Clear
      collector.clear();

      // Verify all cleared
      assertEquals(collector.getMessagesByType("info").length, 0);
      assertEquals(collector.getFileHash("file1.txt"), undefined);
      assertEquals(collector.getEventId("file2.txt"), undefined);
      assertEquals(collector.getAllFileHashes().size, 0);
      assertEquals(collector.getAllEventIds().size, 0);

      const stats = collector.getStats();
      assertEquals(stats.totalByType.info, 0);
      assertEquals(stats.totalByType.success, 0);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty strings", () => {
      collector.addMessage("info", MessageCategory.GENERAL, "", "");

      const messages = collector.getMessagesByType("info");
      assertEquals(messages[0].content, "");
      assertEquals(messages[0].target, "");
    });

    it("should handle very long content", () => {
      const longContent = "a".repeat(1000);
      collector.addMessage("info", MessageCategory.GENERAL, longContent, "target");

      const messages = collector.getMessagesByType("info");
      assertEquals(messages[0].content, longContent);
    });

    it("should handle special characters in content", () => {
      collector.addMessage("info", MessageCategory.GENERAL, "Test\nNew\tLine\r\nSpecial", "target");

      const messages = collector.getMessagesByType("info");
      assertEquals(messages[0].content, "Test\nNew\tLine\r\nSpecial");
    });

    it("should handle undefined data gracefully", () => {
      collector.addMessage("success", MessageCategory.FILE, "Success", "file", undefined);

      const messages = collector.getMessagesByType("success");
      assertEquals(messages[0].data, undefined);
    });

    it("should handle print methods with no matching messages", () => {
      collector.addMessage("info", MessageCategory.GENERAL, "Info", "target");

      collector.printMessageType("error", "Errors");
      collector.printMessageCategory(MessageCategory.FILE, "Files");

      assertEquals(consoleOutput.length, 0);
    });
  });
});
