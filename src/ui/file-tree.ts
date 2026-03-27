import type { FileEntryWithSources } from "../lib/nostr.ts";

export interface ListTreeItem {
  path: string;
  isDirectory: boolean;
  depth: number;
  isLast: boolean;
  parentPrefix: string;
  file?: FileEntryWithSources;
}

export function buildListTreeItems(files: FileEntryWithSources[]): ListTreeItem[] {
  const fileMap = new Map<string, FileEntryWithSources>();
  const directories = new Set<string>();
  const children = new Map<string, Set<string>>();

  const ensureChildren = (path: string) => {
    if (!children.has(path)) {
      children.set(path, new Set());
    }
  };

  ensureChildren("");

  for (const file of files) {
    const normalizedPath = file.path.startsWith("/") ? file.path.substring(1) : file.path;
    fileMap.set(normalizedPath, file);

    const parts = normalizedPath.split("/");
    if (parts.length === 1) {
      children.get("")!.add(normalizedPath);
      continue;
    }

    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      directories.add(currentPath);
      ensureChildren(parentPath);
      ensureChildren(currentPath);
      children.get(parentPath)!.add(currentPath);
    }

    children.get(parts.slice(0, -1).join("/"))!.add(normalizedPath);
  }

  const sortChildren = (paths: string[]) => {
    return paths.sort((a, b) => {
      const aIsDirectory = directories.has(a);
      const bIsDirectory = directories.has(b);
      if (aIsDirectory !== bIsDirectory) {
        return aIsDirectory ? -1 : 1;
      }

      const aName = a.split("/").pop() || a;
      const bName = b.split("/").pop() || b;
      return aName.localeCompare(bName);
    });
  };

  const treeItems: ListTreeItem[] = [];

  const visit = (path: string, depth: number, isLast: boolean, parentPrefix = "") => {
    const isDirectory = directories.has(path);
    treeItems.push({
      path,
      isDirectory,
      depth,
      isLast,
      parentPrefix,
      file: fileMap.get(path),
    });

    if (!isDirectory) {
      return;
    }

    const nextParentPrefix = parentPrefix + (depth > 0 ? (isLast ? "   " : "│  ") : "");
    const childPaths = sortChildren(Array.from(children.get(path) || []));
    childPaths.forEach((childPath, index) => {
      visit(childPath, depth + 1, index === childPaths.length - 1, nextParentPrefix);
    });
  };

  const rootPaths = sortChildren(Array.from(children.get("") || []));
  rootPaths.forEach((path, index) => {
    visit(path, 0, index === rootPaths.length - 1);
  });

  return treeItems;
}
