// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import nsyte from "../../src/commands/root.ts";
import {
  buildManifestRelaySummary,
  categorizeStatusServers,
  registerStatusCommand,
} from "../../src/commands/status.ts";
import { sortManifestEvents } from "../../src/lib/site-manifest.ts";

describe("status command", () => {
  it("registers the status command", () => {
    const existing = nsyte.getCommands().find((cmd) => cmd.getName() === "status");
    if (!existing) {
      registerStatusCommand();
    }

    const statusCommand = nsyte.getCommands().find((cmd) => cmd.getName() === "status");
    assertExists(statusCommand);
    assertEquals(statusCommand.getName(), "status");
  });
});

describe("sortManifestEvents", () => {
  it("sorts manifest events newest-first and removes duplicate ids", () => {
    const events = sortManifestEvents([
      {
        id: "b",
        created_at: 100,
        kind: 15128,
        pubkey: "pubkey",
        content: "",
        sig: "sig",
        tags: [],
      },
      {
        id: "c",
        created_at: 200,
        kind: 15128,
        pubkey: "pubkey",
        content: "",
        sig: "sig",
        tags: [],
      },
      {
        id: "a",
        created_at: 200,
        kind: 15128,
        pubkey: "pubkey",
        content: "",
        sig: "sig",
        tags: [],
      },
      {
        id: "b",
        created_at: 100,
        kind: 15128,
        pubkey: "pubkey",
        content: "",
        sig: "sig",
        tags: [],
      },
    ]);

    assertEquals(events.map((event) => event.id), ["c", "a", "b"]);
  });
});

describe("buildManifestRelaySummary", () => {
  it("counts how many manifest versions were seen on each relay", () => {
    const events = [
      {
        id: "latest",
        created_at: 200,
        kind: 15128,
        pubkey: "pubkey",
        content: "",
        sig: "sig",
        tags: [],
      },
      {
        id: "older",
        created_at: 100,
        kind: 15128,
        pubkey: "pubkey",
        content: "",
        sig: "sig",
        tags: [],
      },
    ];

    Reflect.set(events[0], Symbol.for("seen-relays"), new Set(["wss://relay-a", "wss://relay-b"]));
    Reflect.set(events[1], Symbol.for("seen-relays"), new Set(["wss://relay-a"]));

    const summary = buildManifestRelaySummary(events);

    assertEquals(summary, [
      { relay: "wss://relay-a", versionCount: 2 },
      { relay: "wss://relay-b", versionCount: 1 },
    ]);
  });
});

describe("categorizeStatusServers", () => {
  it("treats manifest hint servers as primary and excludes overlaps from user-only servers", () => {
    const categorized = categorizeStatusServers(
      ["https://hint-a.example", "https://shared.example"],
      ["https://shared.example", "https://user-a.example"],
    );

    assertEquals(categorized, {
      hintServers: ["https://hint-a.example/", "https://shared.example/"],
      userOnlyServers: ["https://user-a.example/"],
      allServers: [
        "https://hint-a.example/",
        "https://shared.example/",
        "https://user-a.example/",
      ],
    });
  });
});
