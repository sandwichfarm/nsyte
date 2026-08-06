// Import test setup FIRST to block all system access
import "../../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { collectDeployEvents } from "../../../src/lib/dry-run/collector.ts";
import type { ProjectConfig } from "../../../src/lib/config.ts";
import type { FilePathMapping } from "../../../src/lib/manifest.ts";
import type { NappConfig } from "../../../src/lib/napp/types.ts";

const testFiles: FilePathMapping[] = [
  { path: "/index.html", sha256: "abc123" },
  { path: "/style.css", sha256: "def456" },
];

const baseConfig: ProjectConfig = {
  servers: ["https://blossom.example.com"],
  relays: ["wss://relay.example.com"],
};

const napp: NappConfig = {
  name: { value: "My App" },
  icon: { hash: "iconhash", mime: "image/png" },
  categories: ["napp.games:rpg"],
  countries: ["*"],
  summary: { value: "a summary" },
  tags: ["foo"],
};

describe("collectDeployEvents — napp listing (kind 37348)", () => {
  it("plain config produces NO kind-37348 event (zero regression)", () => {
    const events = collectDeployEvents(baseConfig, testFiles);
    assertEquals(events.filter((e) => e.kind === 37348).length, 0);
  });

  it("napp config produces exactly one kind-37348 event with right label/filename", () => {
    const config = { ...baseConfig, napp };
    const events = collectDeployEvents(config, testFiles);
    const listing = events.filter((e) => e.kind === 37348);
    assertEquals(listing.length, 1);
    assertEquals(listing[0].label, "App Listing (kind 37348)");
    assertEquals(listing[0].filename, "app-listing-37348.json");
  });

  it("listing appended LAST after the manifest (order unchanged for non-napp prefix)", () => {
    const config = { ...baseConfig, napp };
    const events = collectDeployEvents(config, testFiles);
    assertEquals(events[0].kind, 15128); // manifest still first (root)
    assertEquals(events[events.length - 1].kind, 37348); // listing last
  });

  it("root napp: listing d tag is '' and manifest has no d tag", () => {
    const config = { ...baseConfig, napp }; // no id -> root
    const events = collectDeployEvents(config, testFiles);
    const manifest = events.find((e) => e.kind === 15128)!;
    const listing = events.find((e) => e.kind === 37348)!;
    assertEquals(manifest.template.tags.find((t) => t[0] === "d"), undefined);
    assertEquals(listing.template.tags[0], ["d", ""]);
  });

  it("named napp: listing d tag equals manifest d tag (config.id)", () => {
    const config = { ...baseConfig, id: "my-site", napp };
    const events = collectDeployEvents(config, testFiles);
    const manifest = events.find((e) => e.kind === 35128)!;
    const listing = events.find((e) => e.kind === 37348)!;
    const manifestD = manifest.template.tags.find((t) => t[0] === "d")?.[1];
    const listingD = listing.template.tags.find((t) => t[0] === "d")?.[1];
    assertEquals(manifestD, "my-site");
    assertEquals(listingD, "my-site");
    assertEquals(listingD, manifestD);
  });

  it("listing template carries name + c + l tags (sanity)", () => {
    const config = { ...baseConfig, napp };
    const events = collectDeployEvents(config, testFiles);
    const listing = events.find((e) => e.kind === 37348)!;
    assertEquals(listing.template.tags.find((t) => t[0] === "name"), [
      "name",
      "My App",
    ]);
    assertEquals(listing.template.tags.filter((t) => t[0] === "c"), [[
      "c",
      "*",
    ]]);
    assertEquals(listing.template.tags.filter((t) => t[0] === "l"), [[
      "l",
      "napp.games:rpg",
    ]]);
  });
});
