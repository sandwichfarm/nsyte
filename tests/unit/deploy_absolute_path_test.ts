// deno-lint-ignore-file require-await
import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { resolveDeployTarget } from "../../src/commands/deploy.ts";

const validConfig = {
  relays: ["wss://relay.example.com"],
  servers: ["https://blossom.example.com"],
};

Deno.test("resolveDeployTarget preserves relative-path behavior", async () => {
  let dependencyCalled = false;
  const result = await resolveDeployTarget("dist", {
    nonInteractive: true,
  }, {
    cwd: () => "/project",
    realPath: async (path) => {
      dependencyCalled = true;
      return path;
    },
    confirm: async () => {
      dependencyCalled = true;
      return false;
    },
  });

  assertEquals(result, {
    targetDir: join("/project", "dist"),
    isAbsolute: false,
  });
  assertEquals(dependencyCalled, false);
});

Deno.test("resolveDeployTarget rejects the filesystem root before config lookup", async () => {
  let configRead = false;

  await assertRejects(
    () =>
      resolveDeployTarget("/", { nonInteractive: false }, {
        readConfig: () => {
          configRead = true;
          return validConfig;
        },
      }),
    Error,
    "Refusing to deploy the filesystem root directory",
  );
  assertEquals(configRead, false);
});

Deno.test("resolveDeployTarget rejects a symlink resolving to the filesystem root", async () => {
  await assertRejects(
    () =>
      resolveDeployTarget("/safe-looking-link", {
        config: "/project/.nsite/config.json",
        nonInteractive: false,
      }, {
        readConfig: () => validConfig,
        realPath: async () => "/",
      }),
    Error,
    "Refusing to deploy the filesystem root directory",
  );
});

Deno.test("resolveDeployTarget requires an explicit config for absolute paths", async () => {
  for (const config of [undefined, false, ""] as const) {
    await assertRejects(
      () =>
        resolveDeployTarget("/tmp/site", { config, nonInteractive: false }, {
          realPath: async (path) => path,
        }),
      Error,
      "require an explicit nsite config",
    );
  }
});

Deno.test("resolveDeployTarget requires the explicit config to exist", async () => {
  await assertRejects(
    () =>
      resolveDeployTarget("/tmp/site", {
        config: "/tmp/missing-config.json",
        nonInteractive: false,
      }, {
        readConfig: () => null,
      }),
    Error,
    "No valid nsite config found",
  );
});

Deno.test("resolveDeployTarget reports file count and requires default-safe confirmation", async () => {
  let promptMessage = "";
  const result = await resolveDeployTarget("/tmp/site", {
    config: "/project/.nsite/config.json",
    nonInteractive: false,
  }, {
    readConfig: () => validConfig,
    realPath: async () => "/private/tmp/site",
    scanFiles: async () => ({
      includedFiles: [
        { path: "/index.html", size: 1, sha256: "a" },
        { path: "/app.js", size: 1, sha256: "b" },
      ],
    }),
    confirm: async (message) => {
      promptMessage = message;
      return true;
    },
  });

  assertEquals(result, {
    targetDir: "/private/tmp/site",
    isAbsolute: true,
    fileCount: 2,
  });
  assertStringIncludes(promptMessage, "Absolute deploy target: /private/tmp/site");
  assertStringIncludes(promptMessage, "2 files will be considered for public deployment");
  assertStringIncludes(promptMessage, "replace the site's published file manifest");
});

Deno.test("resolveDeployTarget cancels when confirmation is declined", async () => {
  await assertRejects(
    () =>
      resolveDeployTarget("/tmp/site", {
        config: "/project/.nsite/config.json",
        nonInteractive: false,
      }, {
        readConfig: () => validConfig,
        realPath: async (path) => path,
        scanFiles: async () => ({ includedFiles: [] }),
        confirm: async () => false,
      }),
    Error,
    "Absolute path deploy cancelled",
  );
});

Deno.test("resolveDeployTarget does not bypass confirmation in non-interactive mode", async () => {
  let prompted = false;
  await assertRejects(
    () =>
      resolveDeployTarget("/tmp/site", {
        config: "/project/.nsite/config.json",
        nonInteractive: true,
      }, {
        readConfig: () => validConfig,
        realPath: async (path) => path,
        scanFiles: async () => ({ includedFiles: [{ path: "/index.html", sha256: "a" }] }),
        confirm: async () => {
          prompted = true;
          return true;
        },
      }),
    Error,
    "1 file will be considered for public deployment",
  );
  assertEquals(prompted, false);
});

Deno.test("resolveDeployTarget uses schema validation for the explicit config", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const siteDir = join(tempDir, "site");
    const configPath = join(tempDir, "config.json");
    await Deno.mkdir(siteDir);
    await Deno.writeTextFile(configPath, "{}");

    await assertRejects(
      () =>
        resolveDeployTarget(siteDir, {
          config: configPath,
          nonInteractive: false,
        }, {
          confirm: async () => true,
        }),
      Error,
      "Invalid configuration format",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
