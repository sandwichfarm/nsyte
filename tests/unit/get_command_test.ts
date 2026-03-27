// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { afterEach, describe, it } from "@std/testing/bdd";
import { restore, stub } from "@std/testing/mock";
import { lookupManifestFile, writeGetOutput } from "../../src/commands/get.ts";

describe("writeGetOutput", () => {
  afterEach(() => {
    restore();
  });

  it("streams to stdout when no output path is provided", async () => {
    const stdoutStub = stub(Deno.stdout, "writeSync", () => 0);
    const writeFileStub = stub(Deno, "writeFile", async () => {});
    const data = new TextEncoder().encode("hello");

    await writeGetOutput(data);

    assertEquals(stdoutStub.calls.length, 1);
    assertEquals(writeFileStub.calls.length, 0);
  });

  it("writes to a file when output is provided", async () => {
    const stdoutStub = stub(Deno.stdout, "writeSync", () => 0);
    const writeFileStub = stub(Deno, "writeFile", async () => {});
    const data = new TextEncoder().encode("hello");

    await writeGetOutput(data, "./downloaded.txt");

    assertEquals(stdoutStub.calls.length, 0);
    assertEquals(writeFileStub.calls.length, 1);
    assertEquals(writeFileStub.calls[0].args[0], "./downloaded.txt");
  });
});

describe("lookupManifestFile", () => {
  it("finds a valid manifest entry for the requested path", () => {
    const result = lookupManifestFile([
      { path: "/index.html", sha256: "abc123" },
    ], "index.html");

    assertEquals(result, {
      kind: "found",
      file: { path: "/index.html", sha256: "abc123" },
    });
  });

  it("rejects a matching manifest entry without a sha256", () => {
    const result = lookupManifestFile([
      { path: "/index.html", sha256: undefined as unknown as string },
    ], "/index.html");

    assertEquals(result, { kind: "invalid" });
  });

  it("returns missing when no path matches", () => {
    const result = lookupManifestFile([
      { path: "/index.html", sha256: "abc123" },
    ], "/missing.html");

    assertEquals(result, { kind: "missing" });
  });
});
