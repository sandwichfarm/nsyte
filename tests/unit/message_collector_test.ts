import { assertEquals, assertExists } from "std/assert/mod.ts";
import { stub } from "std/testing/mock.ts";
import { MessageCategory, MessageCollector, MessageType } from "../../src/lib/message-collector.ts";

Deno.test("MessageCollector - Basic Operations", async (t) => {
  await t.step("should create message collector", () => {
    const collector = new MessageCollector();
    assertExists(collector);
    assertEquals(collector instanceof MessageCollector, true);
  });

  await t.step("should create collector with pretty format disabled", () => {
    const collector = new MessageCollector(false);
    assertExists(collector);
  });

  await t.step("should add messages", () => {
    const collector = new MessageCollector();

    collector.addMessage("info", MessageCategory.GENERAL, "Test message", "system");

    const messages = collector.getMessagesByType("info");
    assertEquals(messages.length, 1);
    assertEquals(messages[0].content, "Test message");
    assertEquals(messages[0].target, "system");
    assertEquals(messages[0].count, 1);
  });

  await t.step("should increment count for duplicate messages", () => {
    const collector = new MessageCollector();

    // Add same message 3 times
    collector.addMessage("error", MessageCategory.FILE, "File not found", "test.txt");
    collector.addMessage("error", MessageCategory.FILE, "File not found", "test.txt");
    collector.addMessage("error", MessageCategory.FILE, "File not found", "test.txt");

    const messages = collector.getMessagesByType("error");
    assertEquals(messages.length, 1);
    assertEquals(messages[0].count, 3);
  });

  await t.step("should keep different messages separate", () => {
    const collector = new MessageCollector();

    collector.addMessage("error", MessageCategory.FILE, "File not found", "test1.txt");
    collector.addMessage("error", MessageCategory.FILE, "File not found", "test2.txt");
    collector.addMessage("error", MessageCategory.FILE, "Permission denied", "test1.txt");

    const messages = collector.getMessagesByType("error");
    assertEquals(messages.length, 3);
  });
});

Deno.test("MessageCollector - Specialized Methods", async (t) => {
  await t.step("should add relay rejection", () => {
    const collector = new MessageCollector();

    collector.addRelayRejection("wss://relay.example.com", "rate-limit: too many events");

    const messages = collector.getMessagesByType("relay-rejection");
    assertEquals(messages.length, 1);
    assertEquals(messages[0].category, MessageCategory.RELAY);
    assertEquals(messages[0].target, "wss://relay.example.com");
    assertEquals(messages[0].content, "rate-limit: too many events");
  });

  await t.step("should add connection error", () => {
    const collector = new MessageCollector();

    collector.addConnectionError("wss://relay.example.com", "Connection timeout");

    const messages = collector.getMessagesByType("connection-error");
    assertEquals(messages.length, 1);
    assertEquals(messages[0].category, MessageCategory.RELAY);
    assertEquals(messages[0].content, "Connection timeout");
  });

  await t.step("should add server error", () => {
    const collector = new MessageCollector();

    collector.addServerError("https://blossom.example.com", "500 Internal Server Error");

    const messages = collector.getMessagesByType("error");
    assertEquals(messages.length, 1);
    assertEquals(messages[0].category, MessageCategory.SERVER);
    assertEquals(messages[0].target, "https://blossom.example.com");
  });

  await t.step("should add file error", () => {
    const collector = new MessageCollector();

    collector.addFileError("image.png", "File too large");

    const messages = collector.getMessagesByType("error");
    assertEquals(messages.length, 1);
    assertEquals(messages[0].category, MessageCategory.FILE);
    assertEquals(messages[0].target, "image.png");
  });

  await t.step("should add file success with hash", () => {
    const collector = new MessageCollector();

    collector.addFileSuccess("document.pdf", "abc123def456");

    const messages = collector.getMessagesByType("success");
    assertEquals(messages.length, 1);
    assertEquals(messages[0].category, MessageCategory.FILE);
    assertEquals(messages[0].data?.hash, "abc123def456");

    // Should also store hash
    assertEquals(collector.getFileHash("document.pdf"), "abc123def456");
  });

  await t.step("should add event success with ID", () => {
    const collector = new MessageCollector();

    collector.addEventSuccess("index.html", "event123abc");

    const messages = collector.getMessagesByType("success");
    assertEquals(messages.length, 1);
    assertEquals(messages[0].category, MessageCategory.EVENT);
    assertEquals(messages[0].data?.eventId, "event123abc");

    // Should also store event ID
    assertEquals(collector.getEventId("index.html"), "event123abc");
  });

  await t.step("should add notice", () => {
    const collector = new MessageCollector();

    collector.addNotice("Starting upload process");

    const messages = collector.getMessagesByType("notice");
    assertEquals(messages.length, 1);
    assertEquals(messages[0].category, MessageCategory.GENERAL);
    assertEquals(messages[0].target, "system");
  });

  await t.step("should add notice with custom target", () => {
    const collector = new MessageCollector();

    collector.addNotice("Config loaded", "config-loader");

    const messages = collector.getMessagesByType("notice");
    assertEquals(messages[0].target, "config-loader");
  });
});

Deno.test("MessageCollector - Data Storage", async (t) => {
  await t.step("should store and retrieve file hashes", () => {
    const collector = new MessageCollector();

    collector.addFileSuccess("file1.txt", "hash1");
    collector.addFileSuccess("file2.txt", "hash2");
    collector.addFileSuccess("file3.txt", "hash3");

    assertEquals(collector.getFileHash("file1.txt"), "hash1");
    assertEquals(collector.getFileHash("file2.txt"), "hash2");
    assertEquals(collector.getFileHash("file3.txt"), "hash3");
    assertEquals(collector.getFileHash("nonexistent.txt"), undefined);
  });

  await t.step("should store and retrieve event IDs", () => {
    const collector = new MessageCollector();

    collector.addEventSuccess("page1.html", "event1");
    collector.addEventSuccess("page2.html", "event2");

    assertEquals(collector.getEventId("page1.html"), "event1");
    assertEquals(collector.getEventId("page2.html"), "event2");
    assertEquals(collector.getEventId("nonexistent.html"), undefined);
  });

  await t.step("should get all file hashes", () => {
    const collector = new MessageCollector();

    collector.addFileSuccess("a.txt", "hashA");
    collector.addFileSuccess("b.txt", "hashB");

    const allHashes = collector.getAllFileHashes();
    assertEquals(allHashes instanceof Map, true);
    assertEquals(allHashes.size, 2);
    assertEquals(allHashes.get("a.txt"), "hashA");
    assertEquals(allHashes.get("b.txt"), "hashB");
  });

  await t.step("should get all event IDs", () => {
    const collector = new MessageCollector();

    collector.addEventSuccess("x.html", "eventX");
    collector.addEventSuccess("y.html", "eventY");

    const allEvents = collector.getAllEventIds();
    assertEquals(allEvents instanceof Map, true);
    assertEquals(allEvents.size, 2);
    assertEquals(allEvents.get("x.html"), "eventX");
    assertEquals(allEvents.get("y.html"), "eventY");
  });
});

Deno.test("MessageCollector - Statistics", async (t) => {
  await t.step("should calculate statistics correctly", () => {
    const collector = new MessageCollector();

    // Add various messages
    collector.addMessage("info", MessageCategory.GENERAL, "Info 1", "target1");
    collector.addMessage("info", MessageCategory.GENERAL, "Info 2", "target2");
    collector.addMessage("error", MessageCategory.FILE, "Error 1", "file1");
    collector.addMessage("error", MessageCategory.FILE, "Error 1", "file1"); // Duplicate
    collector.addMessage("success", MessageCategory.EVENT, "Success 1", "event1");
    collector.addRelayRejection("relay1", "rejected");
    collector.addConnectionError("relay2", "timeout");
    collector.addNotice("Notice 1");

    const stats = collector.getStats();

    // Check type counts
    assertEquals(stats.totalByType.info, 2);
    assertEquals(stats.totalByType.error, 2); // Counted as 2 due to duplicate
    assertEquals(stats.totalByType.success, 1);
    assertEquals(stats.totalByType["relay-rejection"], 1);
    assertEquals(stats.totalByType["connection-error"], 1);
    assertEquals(stats.totalByType.notice, 1);
    assertEquals(stats.totalByType.warning, 0);

    // Check category counts
    assertEquals(stats.totalByCategory[MessageCategory.GENERAL], 3); // 2 info + 1 notice
    assertEquals(stats.totalByCategory[MessageCategory.FILE], 2);
    assertEquals(stats.totalByCategory[MessageCategory.EVENT], 1);
    assertEquals(stats.totalByCategory[MessageCategory.RELAY], 2); // 1 rejection + 1 connection error
    assertEquals(stats.totalByCategory[MessageCategory.SERVER], 0);
  });

  await t.step("should handle empty collector stats", () => {
    const collector = new MessageCollector();
    const stats = collector.getStats();

    // All counts should be 0
    Object.values(stats.totalByType).forEach((count) => {
      assertEquals(count, 0);
    });

    Object.values(stats.totalByCategory).forEach((count) => {
      assertEquals(count, 0);
    });
  });
});

Deno.test("MessageCollector - Filtering", async (t) => {
  await t.step("should filter messages by type", () => {
    const collector = new MessageCollector();

    collector.addMessage("error", MessageCategory.FILE, "Error 1", "file1");
    collector.addMessage("error", MessageCategory.SERVER, "Error 2", "server1");
    collector.addMessage("success", MessageCategory.FILE, "Success 1", "file2");
    collector.addMessage("info", MessageCategory.GENERAL, "Info 1", "system");

    const errors = collector.getMessagesByType("error");
    assertEquals(errors.length, 2);

    const successes = collector.getMessagesByType("success");
    assertEquals(successes.length, 1);

    const warnings = collector.getMessagesByType("warning");
    assertEquals(warnings.length, 0);
  });

  await t.step("should filter messages by category", () => {
    const collector = new MessageCollector();

    collector.addMessage("error", MessageCategory.FILE, "File error", "file1");
    collector.addMessage("success", MessageCategory.FILE, "File success", "file2");
    collector.addMessage("error", MessageCategory.SERVER, "Server error", "server1");
    collector.addMessage("info", MessageCategory.RELAY, "Relay info", "relay1");

    const fileMessages = collector.getMessagesByCategory(MessageCategory.FILE);
    assertEquals(fileMessages.length, 2);

    const serverMessages = collector.getMessagesByCategory(MessageCategory.SERVER);
    assertEquals(serverMessages.length, 1);

    const eventMessages = collector.getMessagesByCategory(MessageCategory.EVENT);
    assertEquals(eventMessages.length, 0);
  });

  await t.step("should check message type existence", () => {
    const collector = new MessageCollector();

    collector.addMessage("error", MessageCategory.FILE, "Error", "file");
    collector.addMessage("success", MessageCategory.EVENT, "Success", "event");

    assertEquals(collector.hasMessageType("error"), true);
    assertEquals(collector.hasMessageType("success"), true);
    assertEquals(collector.hasMessageType("warning"), false);
    assertEquals(collector.hasMessageType("info"), false);
  });

  await t.step("should check message category existence", () => {
    const collector = new MessageCollector();

    collector.addMessage("error", MessageCategory.FILE, "Error", "file");
    collector.addMessage("info", MessageCategory.RELAY, "Info", "relay");

    assertEquals(collector.hasMessageCategory(MessageCategory.FILE), true);
    assertEquals(collector.hasMessageCategory(MessageCategory.RELAY), true);
    assertEquals(collector.hasMessageCategory(MessageCategory.SERVER), false);
    assertEquals(collector.hasMessageCategory(MessageCategory.EVENT), false);
  });
});

Deno.test("MessageCollector - Clear", async (t) => {
  await t.step("should clear all data", () => {
    const collector = new MessageCollector();

    // Add various data
    collector.addMessage("error", MessageCategory.FILE, "Error", "file");
    collector.addFileSuccess("file.txt", "hash123");
    collector.addEventSuccess("page.html", "event456");
    collector.addNotice("Notice");

    // Verify data exists
    assertEquals(collector.getMessagesByType("error").length, 1);
    assertEquals(collector.getFileHash("file.txt"), "hash123");
    assertEquals(collector.getEventId("page.html"), "event456");

    // Clear
    collector.clear();

    // Verify all data is cleared
    assertEquals(collector.getMessagesByType("error").length, 0);
    assertEquals(collector.getMessagesByType("success").length, 0);
    assertEquals(collector.getMessagesByType("notice").length, 0);
    assertEquals(collector.getFileHash("file.txt"), undefined);
    assertEquals(collector.getEventId("page.html"), undefined);
    assertEquals(collector.getAllFileHashes().size, 0);
    assertEquals(collector.getAllEventIds().size, 0);
  });
});

Deno.test("MessageCollector - Output Methods", async (t) => {
  await t.step("should not throw when printing empty collections", () => {
    const collector = new MessageCollector();
    const consoleLogStub = stub(console, "log", () => {});

    try {
      // These should not throw or print anything
      collector.printMessageType("error", "Errors");
      collector.printMessageCategory(MessageCategory.FILE, "Files");
      collector.printErrorSummary();
      collector.printRelayIssuesSummary();
      collector.printNotices();
      collector.printAllGroupedMessages();
      collector.printFileSuccessSummary();
      collector.printEventSuccessSummary();

      // No output should be produced
      assertEquals(consoleLogStub.calls.length, 0);
    } finally {
      consoleLogStub.restore();
    }
  });

  await t.step("should print messages by type", () => {
    const collector = new MessageCollector();
    const consoleLogStub = stub(console, "log", () => {});

    try {
      collector.addMessage("error", MessageCategory.FILE, "File error", "test.txt");
      collector.addMessage("error", MessageCategory.FILE, "Another error", "test2.txt");

      collector.printMessageType("error", "Error Messages");

      // Should print header + 2 messages + empty line = 4 calls
      assertEquals(consoleLogStub.calls.length, 4);
      assertEquals(consoleLogStub.calls[0].args[0].includes("Error Messages"), true);
    } finally {
      consoleLogStub.restore();
    }
  });

  await t.step("should format messages with pretty format", () => {
    const collector = new MessageCollector(true);
    const consoleLogStub = stub(console, "log", () => {});

    try {
      collector.addMessage("error", MessageCategory.FILE, "Error message", "file.txt");
      collector.addMessage("success", MessageCategory.FILE, "Success message", "file2.txt");

      collector.printAllGroupedMessages();

      const output = consoleLogStub.calls.map((call) => call.args[0]).join("\n");

      // Should contain color codes and symbols
      assertEquals(output.includes("✗"), true);
      assertEquals(output.includes("✓"), true);
    } finally {
      consoleLogStub.restore();
    }
  });

  await t.step("should format messages without pretty format", () => {
    const collector = new MessageCollector(false);
    const consoleLogStub = stub(console, "log", () => {});

    try {
      collector.addMessage("error", MessageCategory.FILE, "Error message", "file.txt");

      collector.printErrorSummary();

      const output = consoleLogStub.calls.map((call) => call.args[0]).join("\n");

      // Should contain formatted type
      assertEquals(output.includes("[ERROR]"), true);
      assertEquals(output.includes("file(file.txt)"), true);
    } finally {
      consoleLogStub.restore();
    }
  });
});
