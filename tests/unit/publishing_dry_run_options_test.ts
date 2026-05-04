// Import test setup FIRST to block all system access
import "../test-setup-global.ts";

import { assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { registerAnnounceCommand } from "../../src/commands/announce.ts";
import { registerDeleteCommand } from "../../src/commands/delete.ts";
import { registerDeployCommand } from "../../src/commands/deploy.ts";
import { registerPutCommand } from "../../src/commands/put.ts";
import nsyte from "../../src/commands/root.ts";
import { registerSnapshotCommand } from "../../src/commands/snapshot.ts";
import { registerUndeployCommand } from "../../src/commands/undeploy.ts";

type RegisteredCommand = ReturnType<typeof nsyte.getCommands>[number];

function ensureCommand(name: string, register: () => unknown): RegisteredCommand {
  const existing = nsyte.getCommands().find((cmd) => cmd.getName() === name);
  if (existing) {
    return existing;
  }

  register();
  const registered = nsyte.getCommands().find((cmd) => cmd.getName() === name);
  assertExists(registered);
  return registered;
}

function assertDryRunOptions(command: RegisteredCommand): void {
  assertExists(command.getOption("dry-run"));
  assertExists(command.getOption("dry-run-output"));
  assertExists(command.getOption("dry-run-show-kinds"));
}

describe("publishing commands dry-run options", () => {
  const publishingCommands: Array<[string, () => unknown]> = [
    ["announce", registerAnnounceCommand],
    ["deploy", registerDeployCommand],
    ["delete", registerDeleteCommand],
    ["put", registerPutCommand],
    ["snapshot", registerSnapshotCommand],
    ["undeploy", registerUndeployCommand],
  ];

  for (const [name, register] of publishingCommands) {
    it(`${name} exposes standard dry-run controls`, () => {
      assertDryRunOptions(ensureCommand(name, register));
    });
  }
});
