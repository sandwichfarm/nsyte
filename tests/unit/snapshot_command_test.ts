// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import nsyte from "../../src/commands/root.ts";
import { formatSnapshotCreatedAt, registerSnapshotCommand } from "../../src/commands/snapshot.ts";

describe("snapshot command", () => {
  it("registers the snapshot command", () => {
    const existing = nsyte.getCommands().find((cmd) => cmd.getName() === "snapshot");
    if (!existing) {
      registerSnapshotCommand();
    }

    const snapshotCommand = nsyte.getCommands().find((cmd) => cmd.getName() === "snapshot");
    assertExists(snapshotCommand);
    assertEquals(snapshotCommand.getName(), "snapshot");
    assertExists(snapshotCommand.getOption("config"));
    assertExists(snapshotCommand.getOption("no-config"));
    assertExists(snapshotCommand.getOption("name"));
    assertExists(snapshotCommand.getOption("relays"));
    assertExists(snapshotCommand.getOption("dry-run"));
  });

  it("formats snapshot created_at as unix and human-readable text", () => {
    const formatted = formatSnapshotCreatedAt(1);
    assertEquals(formatted.startsWith("1 ("), true);
    assertEquals(formatted.endsWith(")"), true);
  });
});
