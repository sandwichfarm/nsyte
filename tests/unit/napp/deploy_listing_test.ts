// Import test setup FIRST to block all system access
import "../../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { buildDeployListing } from "../../../src/commands/deploy.ts";
import type { ProjectConfig } from "../../../src/lib/config.ts";
import type { NappConfig } from "../../../src/lib/napp/types.ts";

const napp: NappConfig = {
  name: { value: "My App" },
  icon: { hash: "iconhash", mime: "image/png" },
  categories: ["napp.games:rpg"],
  countries: ["*"],
};

const baseConfig: ProjectConfig = {
  servers: ["https://blossom.example.com"],
  relays: ["wss://relay.example.com"],
};

describe("buildDeployListing", () => {
  it("returns null for a non-napp config (zero-regression proof)", () => {
    assertEquals(buildDeployListing(baseConfig, "pub", ""), null);
  });

  it('named napp -> template kind 37348 with ["d","my-site"]', () => {
    const config = { ...baseConfig, napp };
    const t = buildDeployListing(config, "pub", "my-site");
    assertEquals(t?.kind, 37348);
    assertEquals(t?.tags[0], ["d", "my-site"]);
  });

  it('root napp -> ["d",""]', () => {
    const config = { ...baseConfig, napp };
    const t = buildDeployListing(config, "pub", "");
    assertEquals(t?.tags[0], ["d", ""]);
  });

  it("honors the createdAt override", () => {
    const config = { ...baseConfig, napp };
    const t = buildDeployListing(config, "pub", "", 1234567890);
    assertEquals(t?.created_at, 1234567890);
  });

  it("required tags present (name/icon/c/l)", () => {
    const config = { ...baseConfig, napp };
    const t = buildDeployListing(config, "pub", "")!;
    assertEquals(t.tags.find((x) => x[0] === "name"), ["name", "My App"]);
    assertEquals(t.tags.find((x) => x[0] === "icon"), ["icon", "iconhash", "image/png"]);
    assertEquals(t.tags.filter((x) => x[0] === "c"), [["c", "*"]]);
    assertEquals(t.tags.filter((x) => x[0] === "l"), [["l", "napp.games:rpg"]]);
  });
});
