import * as path from "std/path/mod.ts";

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

  // Update src/version.ts
  try {
    const srcVersionTsContent = `export const version = "${version}";\n`;
    // Check current content to avoid unnecessary writes/git changes
    let currentSrcVersion = "";
    try {
        currentSrcVersion = (await Deno.readTextFile(srcVersionTsPath)).trim();
    } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
        // if file doesn't exist, that's fine, we'll create it
    }
    if (currentSrcVersion !== srcVersionTsContent.trim()) {
        await Deno.writeTextFile(srcVersionTsPath, srcVersionTsContent);
        console.log(`Successfully updated src/version.ts to ${version}`);
    } else {
        console.log("src/version.ts is already up to date.");
    }
  } catch (error) {
    console.error("Error updating src/version.ts:", error);
    return;
  }

  // Update deno.json
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

  // Git operations (commit and tag)
  try {
    const statusProcess = new Deno.Command("git", { args: ["status", "--porcelain", "VERSION", "src/version.ts", "deno.json"] });
    const { stdout: statusOutput } = await statusProcess.output();
    const status = new TextDecoder().decode(statusOutput).trim();

    let committedFiles = false;
    if (status) {
        console.log(`Committing changes to VERSION, src/version.ts, and/or deno.json...`);
        const addProcess = new Deno.Command("git", { args: ["add", "VERSION", "src/version.ts", "deno.json"] });
        await addProcess.output();

        const commitMessage = `chore: bump version to ${version}`;
        const commitProcess = new Deno.Command("git", { args: ["commit", "-m", commitMessage] });
        const { stderr: commitErr, stdout: commitOut } = await commitProcess.output();
        const commitErrText = new TextDecoder().decode(commitErr);
        const commitOutText = new TextDecoder().decode(commitOut);

        if (commitErrText && !commitOutText.includes("nothing to commit") && !commitOutText.includes(commitMessage)) {
             if (!commitErrText.includes("nothing to commit")) {
                console.error("Error committing changes:", commitErrText);
                return; // If commit failed, don't tag
             } else {
                console.log("Nothing to commit. Monitored files are already in the desired state.");
             }
        } else if (commitOutText.includes("nothing to commit")){
            console.log("Nothing to commit. Monitored files are already in the desired state.");
        } else {
            console.log(`Successfully committed version update: ${version}`);
            committedFiles = true;
        }
    } else {
        console.log("No changes in VERSION, src/version.ts, or deno.json to commit.");
    }
    
    // Check for other unstaged changes not related to version files
    const generalStatusProcess = new Deno.Command("git", { args: ["status", "--porcelain"] });
    const { stdout: generalStatusOutput } = await generalStatusProcess.output();
    const generalStatus = new TextDecoder().decode(generalStatusOutput).trim();
    const otherChanges = generalStatus.split('\n').filter(line => 
        !line.includes("VERSION") && 
        !line.includes("src/version.ts") && 
        !line.includes("deno.json")
    ).map(line => line.substring(3)).join(", ");

    if(otherChanges && !committedFiles){
        console.warn(`Warning: Uncommitted changes detected in other files: ${otherChanges}. Please commit or stash them if they should not be part of the version tag ${gitTagVersion}.`);
    }

    // Check if tag already exists
    const tagCheckProcess = new Deno.Command("git", { args: ["tag", "-l", gitTagVersion] });
    const { stdout: tagCheckOutput } = await tagCheckProcess.output();
    if (new TextDecoder().decode(tagCheckOutput).trim() === gitTagVersion) {
        console.log(`Git tag ${gitTagVersion} already exists.`);
    } else {
        console.log(`Creating git tag ${gitTagVersion}...`);
        const tagProcess = new Deno.Command("git", { args: ["tag", gitTagVersion] });
        const { stderr: tagErr } = await tagProcess.output();
        const tagErrText = new TextDecoder().decode(tagErr);
        if (tagErrText) {
            console.error("Error creating git tag:", tagErrText);
        } else {
            console.log(`Successfully created git tag ${gitTagVersion}. Run 'git push --tags' to publish it.`);
        }
    }

  } catch (error) {
    console.error("Error performing git operations:", error);
  }
}

if (import.meta.main) {
  updateVersion();
} 