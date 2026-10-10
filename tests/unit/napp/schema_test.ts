import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { validateConfig } from "../../../src/lib/config-validator.ts";
import { readProjectFile } from "../../../src/lib/config.ts";

function plainConfig() {
  return {
    relays: ["wss://relay.damus.io"],
    servers: ["https://cdn.hzrd149.com"],
  };
}

function validNappConfig() {
  return {
    ...plainConfig(),
    napp: {
      name: { value: "My App" },
      icon: { hash: "abc123", mime: "image/png" },
      categories: ["napp.games:rpg"],
      countries: ["*"],
    },
  };
}

Deno.test("validateConfig - plain config (no napp) is valid (zero regression)", () => {
  const result = validateConfig(plainConfig());
  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("validateConfig - plain full config still valid (zero regression)", () => {
  const result = validateConfig({
    ...plainConfig(),
    bunkerPubkey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    id: "blog",
    title: "My Blog",
    description: "A blog",
  });
  assertEquals(result.valid, true);
});

Deno.test("validateConfig - valid napp section is valid", () => {
  const result = validateConfig(validNappConfig());
  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("validateConfig - napp missing name is invalid under /napp", () => {
  const config = validNappConfig() as Record<string, unknown>;
  const napp = config.napp as Record<string, unknown>;
  delete napp.name;
  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.some((e) => e.path.includes("/napp")), true);
});

Deno.test("validateConfig - napp with unknown property is invalid", () => {
  const config = validNappConfig() as Record<string, unknown>;
  (config.napp as Record<string, unknown>).bogus = "nope";
  const result = validateConfig(config);
  assertEquals(result.valid, false);
});

Deno.test("validateConfig - napp.categories with unknown label is invalid", () => {
  const config = validNappConfig();
  config.napp.categories = ["napp.bogus:rpg"];
  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.some((e) => e.message.includes("bogus")), true);
});

Deno.test("validateConfig - napp with 4 categories is invalid", () => {
  const config = validNappConfig();
  config.napp.categories = [
    "napp.games:rpg",
    "napp.money:wallet",
    "napp.social:blog",
    "napp.shopping:store",
  ];
  const result = validateConfig(config);
  assertEquals(result.valid, false);
});

Deno.test("validateConfig - napp countries ['*','US'] is rejected (mixed wildcard)", () => {
  // Schema pattern alone permits this; structural validateNappConfig rejects it.
  const config = validNappConfig();
  config.napp.countries = ["*", "US"];
  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.some((e) => e.path === "/napp/countries"), true);
});

Deno.test("validateConfig - napp indexerRelays reject non-relay URLs", () => {
  const config = validNappConfig();
  config.napp.indexerRelays = ["https://relay.example.com", "nope"];
  const result = validateConfig(config);
  assertEquals(result.valid, false);
  assertEquals(result.errors.some((e) => e.path === "/napp/indexerRelays"), true);
});

Deno.test("validateConfig - napp icon missing hash is invalid", () => {
  const config = validNappConfig();
  config.napp.icon = { mime: "image/png" } as { hash: string; mime: string };
  const result = validateConfig(config);
  assertEquals(result.valid, false);
});

Deno.test("readProjectFile - round-trips a valid napp config via temp dir", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "nsyte-test-napp-" });
  try {
    const nsiteDir = join(tmp, ".nsite");
    Deno.mkdirSync(nsiteDir);
    const configPath = join(nsiteDir, "config.json");
    Deno.writeTextFileSync(
      configPath,
      JSON.stringify(validNappConfig(), null, 2),
    );

    const loaded = readProjectFile(configPath);
    assertEquals(loaded !== null, true);
    assertEquals(loaded!.napp?.name.value, "My App");
    assertEquals(loaded!.napp?.categories, ["napp.games:rpg"]);
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
});
