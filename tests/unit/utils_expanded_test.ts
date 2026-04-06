import { assertEquals } from "@std/assert";
import { afterEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import type { NostrEvent } from "applesauce-core/helpers";
import {
  detectSourceUrl,
  extractServersFromEvent,
  extractServersFromManifestEvents,
  parseRelayInput,
  sshToHttpsUrl,
  truncateString,
} from "../../src/lib/utils.ts";

function makeEvent(tags: string[][]): NostrEvent {
  return {
    id: "test",
    pubkey: "test",
    created_at: 0,
    kind: 10063,
    tags,
    content: "",
    sig: "test",
  };
}

afterEach(() => {
  restore();
});

describe("extractServersFromEvent", () => {
  it("returns empty array for null event", () => {
    assertEquals(extractServersFromEvent(null), []);
  });

  it("returns empty array for event with no tags", () => {
    const event = makeEvent([]);
    assertEquals(extractServersFromEvent(event), []);
  });

  it("returns empty array for event with non-server tags", () => {
    const event = makeEvent([["p", "abc"], ["e", "def"]]);
    assertEquals(extractServersFromEvent(event), []);
  });

  it("extracts server URLs from server tags", () => {
    const event = makeEvent([
      ["server", "https://s1.com"],
      ["server", "https://s2.com"],
    ]);
    assertEquals(extractServersFromEvent(event), ["https://s1.com", "https://s2.com"]);
  });

  it("skips server tags with no URL", () => {
    const event = makeEvent([["server"]]);
    assertEquals(extractServersFromEvent(event), []);
  });
});

describe("extractServersFromManifestEvents", () => {
  it("returns empty array for empty events array", () => {
    assertEquals(extractServersFromManifestEvents([]), []);
  });

  it("extracts servers from single event", () => {
    const event = makeEvent([["server", "https://s1.com"]]);
    assertEquals(extractServersFromManifestEvents([event]), ["https://s1.com"]);
  });

  it("deduplicates servers across multiple events", () => {
    const event1 = makeEvent([
      ["server", "https://s1.com"],
      ["server", "https://s2.com"],
    ]);
    const event2 = makeEvent([
      ["server", "https://s2.com"],
      ["server", "https://s3.com"],
    ]);
    const result = extractServersFromManifestEvents([event1, event2]);
    assertEquals(result, ["https://s1.com", "https://s2.com", "https://s3.com"]);
  });

  it("preserves order from most recent event first (input order)", () => {
    const event1 = makeEvent([["server", "https://recent.com"]]);
    const event2 = makeEvent([["server", "https://older.com"]]);
    // event1 is passed first (most recent)
    const result = extractServersFromManifestEvents([event1, event2]);
    assertEquals(result[0], "https://recent.com");
    assertEquals(result[1], "https://older.com");
  });
});

describe("parseRelayInput", () => {
  it("parses single relay URL", () => {
    const result = parseRelayInput("wss://relay1.example.com");
    // relaySet from applesauce may normalize URLs (e.g. add trailing slash)
    assertEquals(Array.isArray(result), true);
    assertEquals(result.length >= 1, true);
    assertEquals(result.some((r) => r.includes("relay1.example.com")), true);
  });

  it("splits comma-separated relays and trims whitespace", () => {
    const result = parseRelayInput("wss://r1.com, wss://r2.com");
    assertEquals(result.length >= 2, true);
    assertEquals(result.some((r) => r.includes("r1.com")), true);
    assertEquals(result.some((r) => r.includes("r2.com")), true);
  });

  it("filters empty segments from double-comma input", () => {
    const result = parseRelayInput("wss://r1.com,,wss://r2.com");
    assertEquals(result.length >= 2, true);
    assertEquals(result.some((r) => r.includes("r1.com")), true);
    assertEquals(result.some((r) => r.includes("r2.com")), true);
  });
});

describe("sshToHttpsUrl", () => {
  it("converts git@github.com:user/repo.git to https://github.com/user/repo", () => {
    assertEquals(
      sshToHttpsUrl("git@github.com:user/repo.git"),
      "https://github.com/user/repo",
    );
  });

  it("converts git@github.com:user/repo (no .git) to https://github.com/user/repo", () => {
    assertEquals(
      sshToHttpsUrl("git@github.com:user/repo"),
      "https://github.com/user/repo",
    );
  });

  it("converts git@gitlab.com:org/project.git to https://gitlab.com/org/project", () => {
    assertEquals(
      sshToHttpsUrl("git@gitlab.com:org/project.git"),
      "https://gitlab.com/org/project",
    );
  });

  it("returns null for https URL (not SSH format)", () => {
    assertEquals(sshToHttpsUrl("https://github.com/user/repo"), null);
  });

  it("returns null for random string", () => {
    assertEquals(sshToHttpsUrl("not-a-url"), null);
  });
});

describe("detectSourceUrl", () => {
  it("returns configSource when provided (no git needed)", async () => {
    const result = await detectSourceUrl("https://example.com");
    assertEquals(result, "https://example.com");
  });

  it("returns undefined when git command fails", async () => {
    const commandStub = stub(Deno, "Command" as any, () => ({
      output: () => Promise.resolve({ success: false, stdout: new Uint8Array() }),
    }));
    try {
      const result = await detectSourceUrl();
      assertEquals(result, undefined);
    } finally {
      commandStub.restore();
    }
  });

  it("returns HTTPS URL from git remote (strips .git suffix)", async () => {
    const encoder = new TextEncoder();
    const commandStub = stub(Deno, "Command" as any, () => ({
      output: () =>
        Promise.resolve({
          success: true,
          stdout: encoder.encode("https://github.com/user/repo.git\n"),
        }),
    }));
    try {
      const result = await detectSourceUrl();
      assertEquals(result, "https://github.com/user/repo");
    } finally {
      commandStub.restore();
    }
  });

  it("converts SSH remote to HTTPS", async () => {
    const encoder = new TextEncoder();
    const commandStub = stub(Deno, "Command" as any, () => ({
      output: () =>
        Promise.resolve({
          success: true,
          stdout: encoder.encode("git@github.com:user/repo.git\n"),
        }),
    }));
    try {
      const result = await detectSourceUrl();
      assertEquals(result, "https://github.com/user/repo");
    } finally {
      commandStub.restore();
    }
  });

  it("returns undefined when git remote output is empty", async () => {
    const commandStub = stub(Deno, "Command" as any, () => ({
      output: () =>
        Promise.resolve({
          success: true,
          stdout: new Uint8Array(),
        }),
    }));
    try {
      const result = await detectSourceUrl();
      assertEquals(result, undefined);
    } finally {
      commandStub.restore();
    }
  });

  it("returns undefined when Deno.Command throws", async () => {
    const commandStub = stub(Deno, "Command" as any, () => {
      throw new Error("Command not found");
    });
    try {
      const result = await detectSourceUrl();
      assertEquals(result, undefined);
    } finally {
      commandStub.restore();
    }
  });
});

describe("truncateString", () => {
  it("returns empty string for empty input", () => {
    assertEquals(truncateString(""), "");
  });

  it("returns empty string for falsy input (undefined)", () => {
    assertEquals(truncateString(undefined as any), "");
  });

  it("returns original string when shorter than prefix+suffix+3", () => {
    // "short" length=5, prefixLength=8, 5 <= 8+0+3=11
    assertEquals(truncateString("short", 8), "short");
  });

  it("truncates with ellipsis using default prefixLength=8", () => {
    // "abcdefghijklmnopqrst" length=20, 20 > 8+0+3=11
    assertEquals(truncateString("abcdefghijklmnopqrst"), "abcdefgh...");
  });

  it("truncates with prefix and suffix", () => {
    // "abcdefghijklmnopqrst" length=20, 20 > 4+4+3=11
    assertEquals(truncateString("abcdefghijklmnopqrst", 4, 4), "abcd...qrst");
  });

  it("returns original when exactly at boundary (length <= prefix+suffix+3)", () => {
    // "abcdefghijk" length=11, prefixLength=8, 11 <= 8+0+3=11
    assertEquals(truncateString("abcdefghijk", 8), "abcdefghijk");
  });
});
