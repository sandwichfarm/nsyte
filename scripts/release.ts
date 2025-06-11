import * as path from "std/path/mod.ts";
import { Confirm } from "@cliffy/prompt";

async function release() {
  const rootDir = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), "..");
  const versionFilePath = path.join(rootDir, "VERSION");

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

  const gitTagVersion = `v${version}`;
  console.log(`Preparing to release version ${version} (tag ${gitTagVersion}).`);

  try {
    const localTagCheckProcess = new Deno.Command("git", {
      args: ["rev-parse", gitTagVersion],
      stdout: "piped",
      stderr: "piped",
    });
    const localTagCheckOutput = await localTagCheckProcess.output();
    if (localTagCheckOutput.code !== 0) {
      console.error(
        `Error: Local tag ${gitTagVersion} does not exist. Please run the version update script first (e.g., 'deno task version:update').`,
      );
      const localTagErrText = new TextDecoder().decode(localTagCheckOutput.stderr).trim();
      if (localTagErrText) {
        console.error("Details:", localTagErrText);
      }
      return;
    }
    console.log(`Local tag ${gitTagVersion} found.`);
  } catch (error) {
    console.error("Error checking for local tag:", error);
    return;
  }

  try {
    console.log("Pushing commits to origin...");
    const pushCommitsProcess = new Deno.Command("git", {
      args: ["push"],
      stdout: "piped",
      stderr: "piped",
    });
    const pushCommitsOutput = await pushCommitsProcess.output();
    if (pushCommitsOutput.code !== 0) {
      const errText = new TextDecoder().decode(pushCommitsOutput.stderr).trim();
      if (errText && !errText.includes("Everything up-to-date")) {
        console.error("Error pushing commits:", errText);
      } else {
        console.log("Commits are up-to-date or pushed successfully.");
      }
    } else {
      console.log("Commits pushed successfully or already up-to-date.");
    }
  } catch (error) {
    console.error("Error during git push:", error);
  }

  try {
    console.log(`Checking if tag ${gitTagVersion} exists on remote 'origin'...`);
    const remoteTagCheckProcess = new Deno.Command("git", {
      args: ["ls-remote", "--tags", "origin", `refs/tags/${gitTagVersion}`],
      stdout: "piped",
      stderr: "piped",
    });
    const { stdout: remoteTagCheckOut, code: remoteTagCheckCode, stderr: remoteTagCheckErr } =
      await remoteTagCheckProcess.output();
    const remoteTagOutput = new TextDecoder().decode(remoteTagCheckOut).trim();
    const remoteTagErrText = new TextDecoder().decode(remoteTagCheckErr).trim();

    if (remoteTagCheckCode !== 0 && remoteTagErrText) {
      console.warn("Warning checking remote tag:", remoteTagErrText);
    }

    const remoteTagExists = remoteTagOutput.includes(`refs/tags/${gitTagVersion}`);

    if (remoteTagExists) {
      console.log(`Tag ${gitTagVersion} already exists on remote 'origin'.`);
      const overwriteRemote = await Confirm.prompt("Delete remote tag and push local tag? (Y/n)");
      if (overwriteRemote) {
        console.log(`Deleting remote tag ${gitTagVersion} from 'origin'...`);
        const deleteRemoteTagProcess = new Deno.Command("git", {
          args: ["push", "origin", ":refs/tags/" + gitTagVersion],
          stdout: "piped",
          stderr: "piped",
        });
        const delRemoteOut = await deleteRemoteTagProcess.output();
        if (delRemoteOut.code !== 0) {
          console.error(
            "Error deleting remote tag:",
            new TextDecoder().decode(delRemoteOut.stderr).trim(),
          );
          return;
        }
        console.log(`Successfully deleted remote tag ${gitTagVersion}.`);
      } else {
        console.log("Release aborted by user. Remote tag will not be changed.");
        return;
      }
    }

    console.log(`Pushing tag ${gitTagVersion} to 'origin'...`);
    const pushTagProcess = new Deno.Command("git", {
      args: ["push", "origin", gitTagVersion],
      stdout: "piped",
      stderr: "piped",
    });
    const pushTagOut = await pushTagProcess.output();
    if (pushTagOut.code !== 0) {
      console.error("Error pushing tag:", new TextDecoder().decode(pushTagOut.stderr).trim());
    } else {
      console.log(`Successfully pushed tag ${gitTagVersion} to 'origin'.`);
    }
  } catch (error) {
    console.error("Error during git tag operations:", error);
  }
}

if (import.meta.main) {
  release();
}
