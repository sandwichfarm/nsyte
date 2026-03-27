// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { buildListTreeItems } from "../../src/ui/file-tree.ts";
import type { FileEntryWithSources } from "../../src/lib/nostr.ts";

function createFile(path: string): FileEntryWithSources {
  return {
    path,
    sha256: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    eventId: "event-id",
    event: {} as never,
    foundOnRelays: [],
    availableOnServers: [],
  };
}

describe("buildListTreeItems", () => {
  it("keeps nested files adjacent to their parent directory", () => {
    const files = [
      createFile("/about/index.html"),
      createFile("/blog/hello-world/index.html"),
      createFile("/blog/index.html"),
      createFile("/projects/index.html"),
      createFile("/favicon.ico"),
    ];

    const items = buildListTreeItems(files);

    assertEquals(items.map((item) => item.path), [
      "about",
      "about/index.html",
      "blog",
      "blog/hello-world",
      "blog/hello-world/index.html",
      "blog/index.html",
      "projects",
      "projects/index.html",
      "favicon.ico",
    ]);
  });

  it("preserves connector prefixes for nested siblings", () => {
    const files = [
      createFile("/blog/hello-world/index.html"),
      createFile("/blog/index.html"),
    ];

    const items = buildListTreeItems(files);

    assertEquals(
      items.map((item) => ({
        path: item.path,
        depth: item.depth,
        isLast: item.isLast,
        parentPrefix: item.parentPrefix,
      })),
      [
        { path: "blog", depth: 0, isLast: true, parentPrefix: "" },
        { path: "blog/hello-world", depth: 1, isLast: false, parentPrefix: "" },
        { path: "blog/hello-world/index.html", depth: 2, isLast: true, parentPrefix: "│  " },
        { path: "blog/index.html", depth: 1, isLast: true, parentPrefix: "" },
      ],
    );
  });
});
