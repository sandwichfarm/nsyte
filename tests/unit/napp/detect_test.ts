import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { isNapp, validateNappConfig } from "../../../src/lib/napp/detect.ts";
import type { NappConfig } from "../../../src/lib/napp/types.ts";

function validNapp(): NappConfig {
  return {
    name: { value: "My App" },
    icon: { hash: "abc123", mime: "image/png" },
    categories: ["napp.games:rpg"],
    countries: ["*"],
  };
}

Deno.test("isNapp - plain nsite config (no napp) is false", () => {
  assertEquals(
    isNapp({ relays: ["wss://relay.damus.io"], servers: ["https://cdn.hzrd149.com"] }),
    false,
  );
});

Deno.test("isNapp - fully valid napp section is true", () => {
  assertEquals(isNapp({ relays: [], servers: [], napp: validNapp() }), true);
});

Deno.test("isNapp - napp present but missing name is false", () => {
  const napp = validNapp() as Record<string, unknown>;
  delete napp.name;
  assertEquals(isNapp({ relays: [], servers: [], napp }), false);
});

Deno.test("validateNappConfig - valid napp returns []", () => {
  assertEquals(validateNappConfig(validNapp()), []);
});

Deno.test("validateNappConfig - non-object returns /napp error", () => {
  const errs = validateNappConfig(null);
  assertEquals(errs.length, 1);
  assertEquals(errs[0].path, "/napp");
});

Deno.test("validateNappConfig - missing icon -> /napp/icon error", () => {
  const napp = validNapp() as Record<string, unknown>;
  delete napp.icon;
  const errs = validateNappConfig(napp);
  assertEquals(errs.some((e) => e.path === "/napp/icon"), true);
});

Deno.test("validateNappConfig - icon missing hash/mime -> specific paths", () => {
  const errs = validateNappConfig({
    ...validNapp(),
    icon: { hash: "", mime: "" },
  });
  assertEquals(errs.some((e) => e.path === "/napp/icon/hash"), true);
  assertEquals(errs.some((e) => e.path === "/napp/icon/mime"), true);
});

Deno.test("validateNappConfig - missing name -> /napp/name error", () => {
  const napp = validNapp() as Record<string, unknown>;
  delete napp.name;
  const errs = validateNappConfig(napp);
  assertEquals(errs.some((e) => e.path === "/napp/name"), true);
});

Deno.test("validateNappConfig - 4 categories -> limit error", () => {
  const errs = validateNappConfig({
    ...validNapp(),
    categories: [
      "napp.games:rpg",
      "napp.money:wallet",
      "napp.social:blog",
      "napp.shopping:store",
    ],
  });
  assertEquals(errs.some((e) => e.path === "/napp/categories"), true);
  assertEquals(errs.some((e) => /at most|too many/.test(e.message)), true);
});

Deno.test("validateNappConfig - bad category label -> /napp/categories error", () => {
  const errs = validateNappConfig({
    ...validNapp(),
    categories: ["napp.bogus:rpg"],
  });
  assertEquals(errs.some((e) => e.path === "/napp/categories"), true);
});

Deno.test("validateNappConfig - empty countries -> /napp/countries error", () => {
  const errs = validateNappConfig({ ...validNapp(), countries: [] });
  assertEquals(errs.some((e) => e.path === "/napp/countries"), true);
});

Deno.test("validateNappConfig - countries ['*'] is valid", () => {
  assertEquals(validateNappConfig({ ...validNapp(), countries: ["*"] }), []);
});

Deno.test("validateNappConfig - countries with codes is valid", () => {
  assertEquals(validateNappConfig({ ...validNapp(), countries: ["US", "de"] }), []);
});

Deno.test("validateNappConfig - mixing '*' and a code -> /napp/countries error", () => {
  // Plan-checker note: the schema pattern alone permits ["*","US"]; the structural
  // check must reject mixing the worldwide wildcard with explicit codes.
  const errs = validateNappConfig({ ...validNapp(), countries: ["*", "US"] });
  assertEquals(errs.some((e) => e.path === "/napp/countries"), true);
});

Deno.test("validateNappConfig - bad country code -> /napp/countries error", () => {
  const errs = validateNappConfig({ ...validNapp(), countries: ["USA"] });
  assertEquals(errs.some((e) => e.path === "/napp/countries"), true);
});

Deno.test("validateNappConfig - self not 64-hex -> /napp/self error", () => {
  const errs = validateNappConfig({ ...validNapp(), self: "deadbeef" });
  assertEquals(errs.some((e) => e.path === "/napp/self"), true);
});

Deno.test("validateNappConfig - valid self (64-hex) passes", () => {
  assertEquals(
    validateNappConfig({
      ...validNapp(),
      self: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    }),
    [],
  );
});

Deno.test("validateNappConfig - bad summary -> /napp/summary error", () => {
  const errs = validateNappConfig({ ...validNapp(), summary: { value: 123 } });
  assertEquals(errs.some((e) => e.path === "/napp/summary"), true);
});

Deno.test("validateNappConfig - bad screenshots entry -> indexed path", () => {
  const errs = validateNappConfig({
    ...validNapp(),
    screenshots: [{ hash: "ok", mime: "image/png" }, { hash: "", mime: "" }],
  });
  assertEquals(errs.some((e) => e.path.startsWith("/napp/screenshots/1")), true);
});

Deno.test("validateNappConfig - keyart same shape as icon", () => {
  const errs = validateNappConfig({
    ...validNapp(),
    keyart: { hash: "", mime: "" },
  });
  assertEquals(errs.some((e) => e.path.startsWith("/napp/keyart")), true);
});

Deno.test("validateNappConfig - tags must be string[]", () => {
  const errs = validateNappConfig({ ...validNapp(), tags: [1, 2] as unknown as string[] });
  assertEquals(errs.some((e) => e.path === "/napp/tags"), true);
});
