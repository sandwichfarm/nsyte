import "../../test-setup-global.ts";
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { resolveNappIdentifier } from "../../../src/commands/napp.ts";
import { decodeNappIdentifier } from "../../../src/lib/napp/identifier.ts";
import type { ProjectConfig } from "../../../src/lib/config.ts";

const TEST_PUBKEY =
  "5a8bc85694d8fbb4f30208649c1c52509636d1e6fdb1f0f4c84a3f10f9383ec9";

const validNapp = {
  name: { value: "My App" },
  icon: { hash: "abc123", mime: "image/png" },
  categories: ["napp.games:rpg"],
  countries: ["*"],
};

function nappProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    relays: [],
    servers: [],
    napp: validNapp,
    ...overrides,
  } as ProjectConfig;
}

describe("resolveNappIdentifier (pure helper)", () => {
  it("returns a + identifier for a named napp and round-trips", () => {
    const config = nappProjectConfig({ id: "my-site" });
    const result = resolveNappIdentifier(config, TEST_PUBKEY);
    assertEquals(result.startsWith("+"), true);
    const decoded = decodeNappIdentifier(result);
    assertEquals(decoded.dTag, "my-site");
    assertEquals(decoded.pubkey, TEST_PUBKEY);
  });

  it("includes only the first 2 configured relays as hints", () => {
    const config = nappProjectConfig({
      id: "my-site",
      relays: ["wss://a", "wss://b", "wss://c"],
    });
    const result = resolveNappIdentifier(config, TEST_PUBKEY);
    const decoded = decodeNappIdentifier(result);
    assertEquals(decoded.relays, ["wss://a", "wss://b"]);
  });

  it("throws a clear error for a root site (empty id)", () => {
    const config = nappProjectConfig({ id: "" });
    const err = assertThrows(() => resolveNappIdentifier(config, TEST_PUBKEY), Error);
    assertStringIncludes(err.message, "named site");
  });

  it("throws a clear error for a root site (undefined id)", () => {
    const config = nappProjectConfig({ id: undefined });
    const err = assertThrows(() => resolveNappIdentifier(config, TEST_PUBKEY), Error);
    assertStringIncludes(err.message, "named site");
  });

  it("throws a clear error for a non-napp config", () => {
    const config = { relays: [], servers: [], id: "my-site" } as ProjectConfig;
    const err = assertThrows(() => resolveNappIdentifier(config, TEST_PUBKEY), Error);
    assertStringIncludes(err.message, "not a napp");
  });
});
