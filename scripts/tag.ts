import * as path from "@std/path";
import { Confirm } from "@cliffy/prompt";

async function updateVersion() {
  const rootDir = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), "..");
  const denoJsonPath = path.join(rootDir, "deno.json");

  let version: string;
  try {
    const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
    version = denoJson.version;
    if (!version || !/^\d+\.\d+\.\d+([-.].+)?$/.test(version)) {
      console.error(`Error: Version "${version}" in deno.json is not a valid semantic version.`);
      return;
    }
  } catch (error) {
    console.error("Error reading deno.json:", error);
    return;
  }

  console.log(`Source version from deno.json: ${version}`);
  const gitTagVersion = `v${version}`;

  try {
    const statusProcess = new Deno.Command("git", {
      args: ["status", "--porcelain", "deno.json"],
    });
    const { stdout: statusOutput } = await statusProcess.output();
    const status = new TextDecoder().decode(statusOutput).trim();

    let committedFiles = false;
    if (status) {
      console.log(`Committing changes to deno.json...`);
      const addProcess = new Deno.Command("git", {
        args: ["add", "deno.json"],
      });
      await addProcess.output();

      const commitMessage = `chore: bump version to ${version}`;
      const commitProcess = new Deno.Command("git", { args: ["commit", "-m", commitMessage] });
      const { stderr: commitErr, stdout: commitOut } = await commitProcess.output();
      const commitErrText = new TextDecoder().decode(commitErr);
      const commitOutText = new TextDecoder().decode(commitOut);

      if (
        commitErrText && !commitOutText.includes("nothing to commit") &&
        !commitOutText.includes(commitMessage)
      ) {
        if (!commitErrText.includes("nothing to commit")) {
          console.error("Error committing changes:", commitErrText);
          return;
        } else {
          console.log("Nothing to commit. deno.json is already in the desired state.");
        }
      } else if (commitOutText.includes("nothing to commit")) {
        console.log("Nothing to commit. deno.json is already in the desired state.");
      } else {
        console.log(`Successfully committed version update: ${version}`);
        committedFiles = true;
      }
    } else {
      console.log("No changes in deno.json to commit.");
    }

    const generalStatusProcess = new Deno.Command("git", { args: ["status", "--porcelain"] });
    const { stdout: generalStatusOutput } = await generalStatusProcess.output();
    const generalStatus = new TextDecoder().decode(generalStatusOutput).trim();
    const otherChanges = generalStatus.split("\n").filter((line) => !line.includes("deno.json"))
      .map((line) => line.substring(3)).join(", ");

    if (otherChanges && !committedFiles) {
      console.warn(
        `Warning: Uncommitted changes detected in other files: ${otherChanges}. Please commit or stash them if they should not be part of the version tag ${gitTagVersion}.`,
      );
    }

    const tagCheckProcess = new Deno.Command("git", { args: ["tag", "-l", gitTagVersion] });
    const { stdout: tagCheckOutput } = await tagCheckProcess.output();
    const localTagExists = new TextDecoder().decode(tagCheckOutput).trim() === gitTagVersion;

    if (localTagExists) {
      console.log(`Git tag ${gitTagVersion} already exists locally.`);
      const overwrite = await Confirm.prompt("Overwrite it? (Y/n)");
      if (overwrite) {
        console.log(`Deleting local tag ${gitTagVersion}...`);
        const deleteTagProcess = new Deno.Command("git", { args: ["tag", "-d", gitTagVersion] });
        const { stderr: deleteTagErr } = await deleteTagProcess.output();
        const deleteTagErrText = new TextDecoder().decode(deleteTagErr);
        if (deleteTagErrText) {
          console.error(`Error deleting local tag ${gitTagVersion}:`, deleteTagErrText);
          return;
        }
        console.log(`Successfully deleted local tag ${gitTagVersion}.`);
      } else {
        console.log("Skipping tag creation.");
        return;
      }
    }
    console.log(`Creating git tag ${gitTagVersion}...`);
    const tagProcess = new Deno.Command("git", { args: ["tag", gitTagVersion] });
    const { stderr: tagErr } = await tagProcess.output();
    const tagErrText = new TextDecoder().decode(tagErr);
    if (tagErrText) {
      console.error("Error creating git tag:", tagErrText);
    } else {
      console.log(
        `Successfully created git tag ${gitTagVersion}. Run 'git push --tags' to publish it.`,
      );
    }
  } catch (error) {
    console.error("Error performing git operations:", error);
  }
}

if (import.meta.main) {
  updateVersion();
}
