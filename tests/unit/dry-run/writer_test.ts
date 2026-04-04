// Import test setup FIRST to block all system access
import "../../test-setup-global.ts";

import { assertEquals, assertNotEquals, assertStringIncludes } from "@std/assert";
import { afterEach, describe, it } from "@std/testing/bdd";
import {
  defaultOutputDir,
  handleDryRunOutput,
  writeDryRunEvents,
} from "../../../src/lib/dry-run/writer.ts";
import type { DryRunEvent } from "../../../src/lib/dry-run/types.ts";

const testEvent: DryRunEvent = {
  label: "Site Manifest (kind 15128)",
  kind: 15128,
  template: {
    kind: 15128,
    created_at: 1700000000,
    tags: [
      ["path", "/index.html", "abc123"],
      ["server", "https://blossom.example.com"],
      ["client", "nsyte"],
    ],
    content: "",
  },
  filename: "manifest-15128.json",
};

describe("defaultOutputDir", () => {
  it("returns a path starting with /tmp/nsyte-dry-run-", () => {
    const dir = defaultOutputDir();
    assertStringIncludes(dir, "/tmp/nsyte-dry-run-");
  });

  it("includes a timestamp in the path", () => {
    const dir = defaultOutputDir();
    // Should match pattern like /tmp/nsyte-dry-run-2026-04-04-0912 (ISO date with HHMM)
    const match = dir.match(/nsyte-dry-run-\d{4}-\d{2}-\d{2}-\d{4}/);
    assertNotEquals(match, null);
  });
});

describe("writeDryRunEvents", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("creates the output directory and writes event files", async () => {
    tempDir = await Deno.makeTempDir({ prefix: "nsyte-dry-run-test-" });
    const outputDir = `${tempDir}/output`;

    const files = await writeDryRunEvents([testEvent], outputDir);

    assertEquals(files.length, 1);
    assertStringIncludes(files[0], "manifest-15128.json");

    const content = await Deno.readTextFile(files[0]);
    const parsed = JSON.parse(content);
    assertEquals(parsed.kind, 15128);
    assertEquals(parsed.tags[0], ["path", "/index.html", "abc123"]);
  });

  it("writes pretty-printed JSON with 2-space indentation", async () => {
    tempDir = await Deno.makeTempDir({ prefix: "nsyte-dry-run-test-" });
    const files = await writeDryRunEvents([testEvent], tempDir);

    const content = await Deno.readTextFile(files[0]);
    assertStringIncludes(content, '  "kind": 15128');
  });

  it("writes multiple events to separate files", async () => {
    tempDir = await Deno.makeTempDir({ prefix: "nsyte-dry-run-test-" });
    const events: DryRunEvent[] = [
      testEvent,
      {
        label: "App Handler (kind 31990)",
        kind: 31990,
        template: {
          kind: 31990,
          created_at: 1700000000,
          tags: [["d", "test"]],
          content: "",
        },
        filename: "app-handler-31990.json",
      },
    ];

    const files = await writeDryRunEvents(events, tempDir);
    assertEquals(files.length, 2);
    assertStringIncludes(files[0], "manifest-15128.json");
    assertStringIncludes(files[1], "app-handler-31990.json");
  });

  it("files end with a newline", async () => {
    tempDir = await Deno.makeTempDir({ prefix: "nsyte-dry-run-test-" });
    const files = await writeDryRunEvents([testEvent], tempDir);

    const content = await Deno.readTextFile(files[0]);
    assertEquals(content.endsWith("\n"), true);
  });
});

describe("handleDryRunOutput", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("writes events and returns DryRunResult", async () => {
    tempDir = await Deno.makeTempDir({ prefix: "nsyte-dry-run-test-" });

    const result = await handleDryRunOutput([testEvent], { outputDir: tempDir });

    assertEquals(result.outputDir, tempDir);
    assertEquals(result.files.length, 1);
    assertEquals(result.events.length, 1);
    assertStringIncludes(result.files[0], "manifest-15128.json");
  });

  it("uses default output directory when none specified", async () => {
    // We can't easily clean this up but /tmp is cleaned on reboot
    const result = await handleDryRunOutput([testEvent], {});
    tempDir = result.outputDir; // for cleanup

    assertStringIncludes(result.outputDir, "/tmp/nsyte-dry-run-");
    assertEquals(result.files.length, 1);
  });
});
