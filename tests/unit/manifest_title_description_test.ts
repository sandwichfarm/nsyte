import "../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  createSiteManifestTemplate,
  type FilePathMapping,
} from "../../src/lib/manifest.ts";

const testFiles: FilePathMapping[] = [
  { path: "/index.html", sha256: "abc123def456" },
];

function findTag(tags: string[][], name: string): string[] | undefined {
  return tags.find((t) => t[0] === name);
}

describe("createSiteManifestTemplate — title and description", () => {
  it("includes title and description tags when provided in metadata", () => {
    const result = createSiteManifestTemplate(testFiles, "my-site", {
      title: "My Site",
      description: "A test blog",
    });

    assertEquals(findTag(result.tags, "title"), ["title", "My Site"]);
    assertEquals(findTag(result.tags, "description"), [
      "description",
      "A test blog",
    ]);
  });

  it("includes title tag only when description is missing", () => {
    const result = createSiteManifestTemplate(testFiles, "my-site", {
      title: "My Site",
    });

    assertEquals(findTag(result.tags, "title"), ["title", "My Site"]);
    assertEquals(findTag(result.tags, "description"), undefined);
  });

  it("includes description tag only when title is missing", () => {
    const result = createSiteManifestTemplate(testFiles, "my-site", {
      description: "A test blog",
    });

    assertEquals(findTag(result.tags, "title"), undefined);
    assertEquals(findTag(result.tags, "description"), [
      "description",
      "A test blog",
    ]);
  });

  it("omits title and description tags when neither is provided", () => {
    const result = createSiteManifestTemplate(testFiles, "my-site", {
      servers: ["https://server.example"],
    });

    assertEquals(findTag(result.tags, "title"), undefined);
    assertEquals(findTag(result.tags, "description"), undefined);
  });

  it("omits title tag when title is empty string", () => {
    const result = createSiteManifestTemplate(testFiles, "my-site", {
      title: "",
    });

    assertEquals(findTag(result.tags, "title"), undefined);
  });

  it("includes all metadata tags together", () => {
    const result = createSiteManifestTemplate(testFiles, "my-site", {
      title: "Full Site",
      description: "Everything",
      servers: ["https://s.example"],
      relays: ["wss://r.example"],
      source: "https://github.com/example/repo",
    });

    assertEquals(findTag(result.tags, "title"), ["title", "Full Site"]);
    assertEquals(findTag(result.tags, "description"), [
      "description",
      "Everything",
    ]);
    assertEquals(findTag(result.tags, "server"), ["server", "https://s.example"]);
    assertEquals(findTag(result.tags, "relay"), ["relay", "wss://r.example"]);
    assertEquals(findTag(result.tags, "source"), [
      "source",
      "https://github.com/example/repo",
    ]);
  });
});
