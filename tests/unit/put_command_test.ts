// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { formatPutSuccessOutput, resolvePutRemotePath } from "../../src/commands/put.ts";

describe("resolvePutRemotePath", () => {
  it("treats extensionless remote paths as directories", () => {
    assertEquals(resolvePutRemotePath("./assets/logo.svg", "/img"), "/img/logo.svg");
    assertEquals(resolvePutRemotePath("/tmp/logo.svg", "img"), "/img/logo.svg");
    assertEquals(resolvePutRemotePath("./logo.svg", "/img/"), "/img/logo.svg");
  });

  it("preserves explicit remote filenames", () => {
    assertEquals(resolvePutRemotePath("./logo.svg", "/img/site-logo.svg"), "/img/site-logo.svg");
    assertEquals(resolvePutRemotePath("./index.html", "pages/home.html"), "/pages/home.html");
  });
});

describe("formatPutSuccessOutput", () => {
  it("includes the blob hash, manifest id, and successful publish targets", () => {
    const lines = formatPutSuccessOutput({
      siteType: "root site",
      localFile: "./logo.svg",
      remotePath: "/img/logo.svg",
      blobHash: "abc123",
      manifestId: "event123",
      successfulServers: ["https://b1.example", "https://b2.example"],
      successfulRelays: ["wss://r1.example", "wss://r2.example"],
    });

    assertEquals(lines.some((line) => line.includes("abc123")), true);
    assertEquals(lines.some((line) => line.includes("event123")), true);
    assertEquals(lines.some((line) => line.includes("https://b1.example")), true);
    assertEquals(lines.some((line) => line.includes("wss://r1.example")), true);
  });
});
