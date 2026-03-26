import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { sshToHttpsUrl } from "../../src/lib/utils.ts";
import { createSiteManifestTemplate } from "../../src/lib/manifest.ts";

describe("sshToHttpsUrl", () => {
  it("converts github SSH URL", () => {
    assertEquals(
      sshToHttpsUrl("git@github.com:user/repo.git"),
      "https://github.com/user/repo",
    );
  });

  it("converts gitlab SSH URL", () => {
    assertEquals(
      sshToHttpsUrl("git@gitlab.com:org/project.git"),
      "https://gitlab.com/org/project",
    );
  });

  it("handles SSH URL without .git suffix", () => {
    assertEquals(
      sshToHttpsUrl("git@github.com:user/repo"),
      "https://github.com/user/repo",
    );
  });

  it("returns null for HTTPS URLs", () => {
    assertEquals(sshToHttpsUrl("https://github.com/user/repo"), null);
  });

  it("returns null for invalid URLs", () => {
    assertEquals(sshToHttpsUrl("not-a-url"), null);
  });
});

describe("createSiteManifestTemplate source tag", () => {
  it("includes source tag when provided", () => {
    const template = createSiteManifestTemplate(
      [{ path: "/index.html", sha256: "abc123" }],
      "blog",
      { source: "https://github.com/user/repo" },
    );
    const sourceTag = template.tags.find((t) => t[0] === "source");
    assertEquals(sourceTag, ["source", "https://github.com/user/repo"]);
  });

  it("omits source tag when not provided", () => {
    const template = createSiteManifestTemplate(
      [{ path: "/index.html", sha256: "abc123" }],
      "blog",
      { title: "Test" },
    );
    const sourceTag = template.tags.find((t) => t[0] === "source");
    assertEquals(sourceTag, undefined);
  });

  it("omits source tag when metadata is undefined", () => {
    const template = createSiteManifestTemplate(
      [{ path: "/index.html", sha256: "abc123" }],
      "blog",
    );
    const sourceTag = template.tags.find((t) => t[0] === "source");
    assertEquals(sourceTag, undefined);
  });
});
