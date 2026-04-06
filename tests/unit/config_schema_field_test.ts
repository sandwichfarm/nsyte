import "../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { CONFIG_SCHEMA_URL, type ProjectConfig } from "../../src/lib/config.ts";
import schema from "../../src/schemas/config.schema.json" with { type: "json" };

describe("Config $schema field", () => {
  it("CONFIG_SCHEMA_URL is the canonical nsyte.run schema URL", () => {
    assertEquals(CONFIG_SCHEMA_URL, "https://nsyte.run/schemas/config.schema.json");
  });

  it("CONFIG_SCHEMA_URL matches the $id in config.schema.json", () => {
    assertEquals(CONFIG_SCHEMA_URL, schema.$id);
  });

  it("$schema field is preserved in JSON serialization", () => {
    const config: ProjectConfig = {
      "$schema": CONFIG_SCHEMA_URL,
      relays: ["wss://relay.example"],
      servers: ["https://server.example"],
    };
    const json = JSON.parse(JSON.stringify(config));
    assertEquals(json["$schema"], CONFIG_SCHEMA_URL);
  });

  it("$schema field appears first in serialized JSON output", () => {
    const config: ProjectConfig = {
      "$schema": CONFIG_SCHEMA_URL,
      relays: ["wss://relay.example"],
      servers: ["https://server.example"],
    };
    const keys = Object.keys(JSON.parse(JSON.stringify(config)));
    assertEquals(keys[0], "$schema");
  });

  it("config without $schema field serializes without it", () => {
    const config: ProjectConfig = {
      relays: ["wss://relay.example"],
      servers: ["https://server.example"],
    };
    const json = JSON.parse(JSON.stringify(config));
    assertEquals(json["$schema"], undefined);
  });
});
