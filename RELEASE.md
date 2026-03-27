# Release Process

## Version Source of Truth

`deno.json` is the single source of truth for the version number. The `src/version.ts` module
imports it via a JSON import, so there is nothing to keep in sync manually.

```
deno.json  --(JSON import)-->  src/version.ts  -->  CLI --version output
```

## Local Release (Tag Push)

1. **Set the version** in `deno.json`:

   ```bash
   deno task version 0.23.0
   ```

   This updates only `deno.json`. No git operations are performed.

2. **Create the git tag** (commits `deno.json` if changed, creates `v0.23.0` tag):

   ```bash
   deno task tag
   ```

3. **Push the tag** to trigger the release workflow:

   ```bash
   deno task release
   ```

   This pushes commits and the tag to `origin`. The `Build and Release` GitHub Action runs
   automatically on tag push.

## Manual Release (workflow_dispatch)

You can also trigger a release from the GitHub Actions UI:

1. Go to **Actions > Build and Release > Run workflow**
2. Enter the version number (e.g., `0.23.0`)
3. The workflow runs `sync-version.ts` to update `deno.json` before building

For tag-triggered releases, `deno.json` already has the correct version from the tagging step, so
the sync is skipped.

## What Each Script Does

| Script                    | Purpose                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `scripts/sync-version.ts` | Updates `deno.json` version field. No git operations.               |
| `scripts/tag.ts`          | Reads version from `deno.json`, commits if needed, creates git tag. |
| `scripts/release.ts`      | Reads version from `deno.json`, pushes commits and tag to origin.   |
