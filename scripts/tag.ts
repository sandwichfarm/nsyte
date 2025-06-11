import * as path from "std/path/mod.ts";
import { Confirm } from "@cliffy/prompt";

async function updateVersion() {
  const rootDir = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), "..");
  const versionFilePath = path.join(rootDir, "VERSION");
  const denoJsonPath = path.join(rootDir, "deno.json");
  const srcVersionTsPath = path.join(rootDir, "src", "version.ts");

  let version: string;
  try {
    version = (await Deno.readTextFile(versionFilePath)).trim();
    if (!/^\d+\.\d+\.\d+([-.].+)?$/.test(version)) {
      console.error(`Error: Version "${version}" in VERSION file is not a valid semantic version.`);
      return;
    }
  } catch (error) {
    console.error("Error reading VERSION file:", error);
    return;
  }

  console.log(`Source version from VERSION file: ${version}`);
  const gitTagVersion = `v${version}`;

  try {
    const versionFileContent = `export const version = "${version}";\n`;
    await Deno.writeTextFile(srcVersionTsPath, versionFileContent);
    console.log(`Successfully updated src/version.ts to version ${version}`);
  } catch (error) {
    console.error("Error updating src/version.ts:", error);
    return;
  }

  try {
    const denoJsonContent = await Deno.readTextFile(denoJsonPath);
    const denoJson = JSON.parse(denoJsonContent);

    if (denoJson.version === version) {
      console.log("deno.json version is already up to date.");
    } else {
      denoJson.version = version;
      await Deno.writeTextFile(denoJsonPath, JSON.stringify(denoJson, null, 2) + "\n");
      console.log(`Successfully updated deno.json to ${version}`);
    }
  } catch (error) {
    console.error("Error updating deno.json:", error);
    return;
  }

  try {
    const statusProcess = new Deno.Command("git", {
      args: ["status", "--porcelain", "VERSION", "src/version.ts", "deno.json"],
    });
    const { stdout: statusOutput } = await statusProcess.output();
    const status = new TextDecoder().decode(statusOutput).trim();

    let committedFiles = false;
    if (status) {
      console.log(`Committing changes to VERSION, src/version.ts, and/or deno.json...`);
      const addProcess = new Deno.Command("git", {
        args: ["add", "VERSION", "src/version.ts", "deno.json"],
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
          console.log("Nothing to commit. Monitored files are already in the desired state.");
        }
      } else if (commitOutText.includes("nothing to commit")) {
        console.log("Nothing to commit. Monitored files are already in the desired state.");
      } else {
        console.log(`Successfully committed version update: ${version}`);
        committedFiles = true;
      }
    } else {
      console.log("No changes in VERSION, src/version.ts, or deno.json to commit.");
    }

    const generalStatusProcess = new Deno.Command("git", { args: ["status", "--porcelain"] });
    const { stdout: generalStatusOutput } = await generalStatusProcess.output();
    const generalStatus = new TextDecoder().decode(generalStatusOutput).trim();
    const otherChanges = generalStatus.split("\n").filter((line) =>
      !line.includes("VERSION") &&
      !line.includes("src/version.ts") &&
      !line.includes("deno.json")
    ).map((line) => line.substring(3)).join(", ");

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
