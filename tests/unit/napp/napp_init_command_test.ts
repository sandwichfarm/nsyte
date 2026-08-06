import "../../test-setup-global.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import {
  decideRootSiteId,
  planNappInitFromFlags,
  registerNappCommand,
} from "../../../src/commands/napp.ts";
import {
  buildNappConfigFromAnswers,
  collectNappListing,
  type NappAssetResolver,
  type ProjectConfig,
  readProjectFile,
  writeProjectFile,
} from "../../../src/lib/config.ts";
import { isNapp, validateNappConfig } from "../../../src/lib/napp/detect.ts";

// A no-network resolver: hash/URL/path all return a deterministic asset so the
// composition tests never touch real blossom servers or relays.
const fakeResolver: NappAssetResolver = (value: string) =>
  Promise.resolve({ hash: `resolved:${value}`, mime: "image/png" });

// Mirror of nappInitAction's flag-driven, non-interactive path (no prompts, no exit):
// plan flags -> collect listing (fake resolver) -> validate -> write/read round-trip.
async function runFlagDrivenInit(
  flags: Parameters<typeof planNappInitFromFlags>[0],
  path: string,
): Promise<ProjectConfig> {
  const plan = planNappInitFromFlags(flags);
  const projectConfig = readProjectFile(path)!;
  if (isRootSiteId(projectConfig.id)) {
    const decision = decideRootSiteId({
      isRoot: true,
      idFlag: plan.id,
      interactive: false,
    });
    if (decision.setId !== undefined) projectConfig.id = decision.setId;
  }
  const napp = await collectNappListing({
    prefill: plan.prefill,
    interactive: false,
    resolveAsset: fakeResolver,
  });
  const updated: ProjectConfig = { ...projectConfig, napp };
  writeProjectFile(updated, path);
  return readProjectFile(path)!;
}

function isRootSiteId(id: ProjectConfig["id"]): boolean {
  return id === undefined || id === null || id === "";
}

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

describe("napp init flag-driven write (temp dir, fake resolver)", () => {
  it("writes a full napp section from flags, preserving unrelated keys", async () => {
    const dir = await Deno.makeTempDir();
    try {
      const path = join(dir, ".nsite", "config.json");
      writeProjectFile({
        relays: ["wss://r"],
        servers: ["https://s"],
        id: "my-site",
      }, path);

      const read = await runFlagDrivenInit({
        name: "My App",
        icon: "a".repeat(64),
        iconMime: "image/png",
        category: ["social:network", "games:rpg"],
        countries: "US, de",
        summary: "Short",
        tag: ["nostr"],
      }, path);

      assert(isNapp(read), "flag-driven config should be a napp");
      assertEquals(validateNappConfig(read.napp).length, 0);
      assertEquals(read.napp!.name, { value: "My App" });
      assertEquals(read.napp!.icon, {
        hash: `resolved:${"a".repeat(64)}`,
        mime: "image/png",
      });
      assertEquals(read.napp!.categories, [
        "napp.social:network",
        "napp.games:rpg",
      ]);
      assertEquals(read.napp!.countries, ["US", "de"]);
      assertEquals(read.napp!.summary, { value: "Short" });
      assertEquals(read.napp!.tags, ["nostr"]);
      // Unrelated keys survive.
      assertEquals(read.relays, ["wss://r"]);
      assertEquals(read.id, "my-site");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });

  it("non-interactive missing-required surfaces via plan.missingRequired", () => {
    const plan = planNappInitFromFlags({ name: "Only Name" });
    assert(plan.missingRequired.length > 0);
    assert(plan.missingRequired.includes("icon"));
    assert(plan.missingRequired.includes("category"));
  });

  it("root-site + --id sets config.id (opt-in migration)", async () => {
    const dir = await Deno.makeTempDir();
    try {
      const path = join(dir, ".nsite", "config.json");
      // Root site: id is empty.
      writeProjectFile({ relays: ["wss://r"], servers: ["https://s"], id: "" }, path);

      const read = await runFlagDrivenInit({
        name: "App",
        icon: "h",
        category: ["games:rpg"],
        id: "blog",
      }, path);

      assertEquals(read.id, "blog");
      assert(isNapp(read));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });

  it("root-site without --id (non-interactive) writes napp without setting id", async () => {
    const dir = await Deno.makeTempDir();
    try {
      const path = join(dir, ".nsite", "config.json");
      writeProjectFile({ relays: ["wss://r"], servers: ["https://s"], id: "" }, path);

      const read = await runFlagDrivenInit({
        name: "App",
        icon: "h",
        category: ["games:rpg"],
      }, path);

      assertEquals(read.id, "");
      assert(isNapp(read), "napp section still written");
      // decideRootSiteId still signals the notice for non-interactive root sites.
      const decision = decideRootSiteId({ isRoot: true, interactive: false });
      assertEquals(decision, { printNotice: true });
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });
});
