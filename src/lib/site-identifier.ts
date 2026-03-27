import type { ProjectConfig } from "./config.ts";

export function normalizeSiteIdentifier(id?: string | null): string | undefined {
  if (id === undefined || id === null || id === "") {
    return undefined;
  }

  return id;
}

export function resolveSiteIdentifier(
  explicitId?: string,
  projectConfig?: Partial<Pick<ProjectConfig, "id">> | null,
): string | undefined {
  if (explicitId !== undefined) {
    return normalizeSiteIdentifier(explicitId);
  }

  return normalizeSiteIdentifier(projectConfig?.id);
}
