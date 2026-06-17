import "../../test-setup-global.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import { registerNappCommand } from "../../../src/commands/napp.ts";
import {
  buildNappConfigFromAnswers,
  type ProjectConfig,
  readProjectFile,
  writeProjectFile,
} from "../../../src/lib/config.ts";
import { isNapp, validateNappConfig } from "../../../src/lib/napp/detect.ts";

const validNapp = {
  name: { value: "My App" },
  icon: { hash: "abc123", mime: "image/png" },
  categories: ["napp.games:rpg"],
  countries: ["*"],
};

describe("napp init subcommand registration", () => {
  it("registerNappCommand() does not throw (registers id/release/init)", () => {
    registerNappCommand();
  });
});

describe("napp init guards", () => {
  it("already-napp guard: isNapp(config-with-valid-napp) === true", () => {
    const config: ProjectConfig = {
      relays: [],
      servers: [],
      napp: validNapp,
    } as ProjectConfig;
    assert(isNapp(config));
  });

  it("no-config guard: readProjectFile(missing path) === null", async () => {
    const dir = await Deno.makeTempDir();
    try {
      const missing = join(dir, "missing", "config.json");
      assertEquals(readProjectFile(missing), null);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });
});

describe("napp init retrofit round-trip (temp dir)", () => {
  it("retrofits a napp section onto a non-napp config, preserving other keys", async () => {
    const dir = await Deno.makeTempDir();
    try {
      const path = join(dir, ".nsite", "config.json");
      // Write a non-napp config first.
      writeProjectFile({
        relays: ["wss://r"],
        servers: ["https://s"],
        id: "my-site",
      }, path);

      const cfg = readProjectFile(path)!;
      assertFalse(isNapp(cfg));

      // Retrofit using the SAME assembly helper the wizard uses.
      cfg.napp = buildNappConfigFromAnswers({
        name: "App",
        iconHash: "h",
        categories: ["napp.games:rpg"],
        countries: ["*"],
      });
      writeProjectFile(cfg, path);

      const read = readProjectFile(path)!;
      assert(isNapp(read), "retrofitted config should be a napp");
      assertEquals(validateNappConfig(read.napp).length, 0);
      // Unrelated keys survive (T-24-01).
      assertEquals(read.relays, ["wss://r"]);
      assertEquals(read.servers, ["https://s"]);
      assertEquals(read.id, "my-site");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });
});
