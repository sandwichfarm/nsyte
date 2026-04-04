// Import test setup FIRST to block all system access
import "../../test-setup-global.ts";

import { assertEquals, assertNotEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  collectAnnounceEvents,
  collectDeployEvents,
} from "../../../src/lib/dry-run/collector.ts";
import type { ProjectConfig } from "../../../src/lib/config.ts";
import type { FilePathMapping } from "../../../src/lib/manifest.ts";

const testFiles: FilePathMapping[] = [
  { path: "/index.html", sha256: "abc123" },
  { path: "/style.css", sha256: "def456" },
];

const baseConfig: ProjectConfig = {
  servers: ["https://blossom.example.com"],
  relays: ["wss://relay.example.com"],
};

describe("collectDeployEvents", () => {
  it("always includes the site manifest event", () => {
    const events = collectDeployEvents(baseConfig, testFiles);
    assertEquals(events.length, 1);
    assertEquals(events[0].kind, 15128); // root site
    assertEquals(events[0].filename, "manifest-15128.json");
    assertEquals(events[0].label, "Site Manifest (kind 15128)");
  });

  it("uses kind 35128 for named sites", () => {
    const config = { ...baseConfig, id: "my-site" };
    const events = collectDeployEvents(config, testFiles);
    assertEquals(events[0].kind, 35128);
    assertEquals(events[0].filename, "manifest-35128.json");
  });

  it("includes path tags for all files in manifest template", () => {
    const events = collectDeployEvents(baseConfig, testFiles);
    const pathTags = events[0].template.tags.filter((t) => t[0] === "path");
    assertEquals(pathTags.length, 2);
    assertEquals(pathTags[0], ["path", "/index.html", "abc123"]);
    assertEquals(pathTags[1], ["path", "/style.css", "def456"]);
  });

  it("includes title and description in manifest metadata", () => {
    const config = { ...baseConfig, title: "My Site", description: "A blog" };
    const events = collectDeployEvents(config, testFiles);
    const titleTag = events[0].template.tags.find((t) => t[0] === "title");
    const descTag = events[0].template.tags.find((t) => t[0] === "description");
    assertEquals(titleTag, ["title", "My Site"]);
    assertEquals(descTag, ["description", "A blog"]);
  });

  it("includes app handler event when publishAppHandler is true", () => {
    const config: ProjectConfig = {
      ...baseConfig,
      id: "my-site",
      appHandler: { kinds: [1, 30023], id: "my-handler" },
    };
    const events = collectDeployEvents(config, testFiles, { publishAppHandler: true });
    const handlerEvent = events.find((e) => e.kind === 31990);
    assertNotEquals(handlerEvent, undefined);
    assertEquals(handlerEvent!.filename, "app-handler-31990.json");
  });

  it("includes profile event when publishProfile is true", () => {
    const config: ProjectConfig = {
      ...baseConfig,
      profile: { name: "Test User" },
    };
    const events = collectDeployEvents(config, testFiles, { publishProfile: true });
    const profileEvent = events.find((e) => e.kind === 0);
    assertNotEquals(profileEvent, undefined);
    assertEquals(profileEvent!.filename, "profile-0.json");
  });

  it("includes relay list event when publishRelayList is true", () => {
    const events = collectDeployEvents(baseConfig, testFiles, { publishRelayList: true });
    const relayEvent = events.find((e) => e.kind === 10002);
    assertNotEquals(relayEvent, undefined);
    const rTags = relayEvent!.template.tags.filter((t) => t[0] === "r");
    assertEquals(rTags.length, 1);
    assertEquals(rTags[0], ["r", "wss://relay.example.com"]);
  });

  it("includes server list event when publishServerList is true", () => {
    const events = collectDeployEvents(baseConfig, testFiles, { publishServerList: true });
    const serverEvent = events.find((e) => e.kind === 10063);
    assertNotEquals(serverEvent, undefined);
    const serverTags = serverEvent!.template.tags.filter((t) => t[0] === "server");
    assertEquals(serverTags.length, 1);
  });

  it("does not import or reference any signer modules", async () => {
    const source = await Deno.readTextFile("src/lib/dry-run/collector.ts");
    assertEquals(source.includes("initSigner"), false);
    assertEquals(source.includes("createSigner"), false);
    assertEquals(source.includes("ISigner"), false);
    assertEquals(source.includes("signer-factory"), false);
    assertEquals(source.includes("signEvent"), false);
  });

  it("uses overridden relays from options", () => {
    const events = collectDeployEvents(baseConfig, testFiles, {
      relays: "wss://custom-relay.example.com",
      publishRelayList: true,
    });
    const relayEvent = events.find((e) => e.kind === 10002);
    assertNotEquals(relayEvent, undefined);
    const rTags = relayEvent!.template.tags.filter((t) => t[0] === "r");
    assertEquals(rTags[0], ["r", "wss://custom-relay.example.com"]);
  });

  it("uses overridden servers from options", () => {
    const events = collectDeployEvents(baseConfig, testFiles, {
      servers: "https://custom-blossom.example.com",
      publishServerList: true,
    });
    const serverEvent = events.find((e) => e.kind === 10063);
    assertNotEquals(serverEvent, undefined);
    const serverTags = serverEvent!.template.tags.filter((t) => t[0] === "server");
    assertEquals(serverTags[0], ["server", "https://custom-blossom.example.com"]);
  });
});

describe("collectAnnounceEvents", () => {
  it("returns app handler event for valid config", () => {
    const config: ProjectConfig = {
      ...baseConfig,
      id: "my-site",
      appHandler: { kinds: [1, 30023], id: "my-handler" },
    };
    const events = collectAnnounceEvents(config);
    assertEquals(events.length, 1);
    assertEquals(events[0].kind, 31990);
    assertEquals(events[0].filename, "app-handler-31990.json");
  });

  it("returns empty array when no handler config", () => {
    const events = collectAnnounceEvents(baseConfig);
    assertEquals(events.length, 0);
  });

  it("includes k tags for each configured kind", () => {
    const config: ProjectConfig = {
      ...baseConfig,
      id: "my-site",
      appHandler: { kinds: [1, 30023], id: "my-handler" },
    };
    const events = collectAnnounceEvents(config);
    const kTags = events[0].template.tags.filter((t) => t[0] === "k");
    assertEquals(kTags.length, 2);
    assertEquals(kTags[0], ["k", "1"]);
    assertEquals(kTags[1], ["k", "30023"]);
  });

  it("returns empty array when kinds array is empty", () => {
    const config: ProjectConfig = {
      ...baseConfig,
      id: "my-site",
      appHandler: { kinds: [], id: "my-handler" },
    };
    const events = collectAnnounceEvents(config);
    assertEquals(events.length, 0);
  });
});
