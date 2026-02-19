import type { FileEntryWithSources } from "../../lib/nostr.ts";
import type { IgnoreRule } from "../../lib/files.ts";
import type { PropagationStats } from "../../lib/propagation-stats.ts";
import { calculatePropagationStats } from "../../lib/propagation-stats.ts";
import type { ISigner } from "applesauce-signers";

export interface TreeItem {
  path: string;
  isDirectory: boolean;
  file?: FileEntryWithSources;
  depth: number;
  isLast: boolean;
  parentPrefix: string;
}

export interface BrowseState {
  files: FileEntryWithSources[];
  filteredFiles: FileEntryWithSources[];
  treeItems: TreeItem[]; // Flat list of all items in tree order
  selectedIndex: number; // Index in treeItems
  selectedItems: Set<string>; // Set of paths instead of indices
  deletingItems: Set<string>; // Items currently being deleted
  deletedItems: Set<string>; // Items that have been deleted
  showSelectedOnly: boolean;
  page: number;
  pageSize: number;
  viewMode: "list" | "detail";
  detailIndex: number | null;
  confirmingDelete: boolean;
  deleteConfirmText: string;
  // Authentication flow states
  authMode: "none" | "select" | "input";
  authChoice?: "hex" | "nsec" | "nbunksec";
  authInput: string;
  authPrompt?: string;
  relayColorMap: Map<string, (str: string) => string>;
  serverColorMap: Map<string, (str: string) => string>;
  ignoreRules: IgnoreRule[];
  signer?: ISigner; // Temporary signer, only used during delete
  authOptions?: { // CLI auth options for creating signer when needed
    sec?: string; // Unified secret parameter (auto-detects format)
  };
  status: string; // Current status message
  statusColor?: (str: string) => string; // Optional color function for status
  filterMode: boolean; // Whether filter is active
  filterText: string; // Current filter text
  switchIdentity: boolean; // Signal to switch identity
  switchSite: boolean; // Signal to switch site (go back to site selection)
  pubkey: string; // Current pubkey being browsed
  blossomServers: string[]; // Cached blossom server list
  propagationStats: PropagationStats; // Propagation strength stats
  siteName?: string; // Name of the currently browsed site
  hasMultipleSites: boolean; // Whether the user has multiple sites (for hotkey display)
}

export function buildTreeItems(files: FileEntryWithSources[]): TreeItem[] {
  const directories = new Map<string, Set<string>>();
  const rootFiles = new Set<string>();

  // Organize files into directory structure
  files.forEach((file) => {
    const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
    const parts = path.split("/");

    if (parts.length === 1) {
      rootFiles.add(path);
    } else {
      let currentPath = "";
      for (let i = 0; i < parts.length - 1; i++) {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];

        if (!directories.has(parentPath)) {
          directories.set(parentPath, new Set());
        }
        directories.get(parentPath)!.add(currentPath);

        if (!directories.has(currentPath)) {
          directories.set(currentPath, new Set());
        }
      }

      // Add file to its parent directory
      const parentDir = parts.slice(0, -1).join("/");
      directories.get(parentDir)!.add(path);
    }
  });

  // Build flat list of all items in tree order
  const treeItems: TreeItem[] = [];

  const buildFlatList = (
    path: string,
    depth: number,
    isLast: boolean,
    parentPrefix: string = "",
  ) => {
    const file = files.find((f) =>
      (f.path.startsWith("/") ? f.path.substring(1) : f.path) === path
    );
    const isDirectory = !file && directories.has(path);

    treeItems.push({
      path,
      isDirectory,
      file,
      depth,
      isLast,
      parentPrefix,
    });

    // Add children
    if (isDirectory && directories.has(path)) {
      const children = Array.from(directories.get(path)!).sort();
      const childPrefix = parentPrefix + (depth > 0 ? (isLast ? "   " : "│  ") : "");

      children.forEach((child, index) => {
        // Avoid duplicates
        if (!treeItems.some((item) => item.path === child)) {
          buildFlatList(child, depth + 1, index === children.length - 1, childPrefix);
        }
      });
    }
  };

  // Build the flat list
  const rootItems = Array.from(rootFiles).concat(
    Array.from(directories.get("") || []),
  ).sort();

  rootItems.forEach((item, index) => {
    buildFlatList(item, 0, index === rootItems.length - 1);
  });

  return treeItems;
}

export function createInitialState(
  files: FileEntryWithSources[],
  pageSize: number,
  relayColorMap: Map<string, (str: string) => string>,
  serverColorMap: Map<string, (str: string) => string>,
  ignoreRules: IgnoreRule[],
  pubkey: string,
  signer?: ISigner,
  siteName?: string,
  hasMultipleSites?: boolean,
): BrowseState {
  const treeItems = buildTreeItems(files);

  // Find first file (non-directory) index
  let initialIndex = 0;
  for (let i = 0; i < treeItems.length; i++) {
    if (!treeItems[i].isDirectory) {
      initialIndex = i;
      break;
    }
  }

  return {
    files,
    filteredFiles: files,
    treeItems,
    selectedIndex: initialIndex,
    selectedItems: new Set(),
    deletingItems: new Set(),
    deletedItems: new Set(),
    showSelectedOnly: false,
    page: 0,
    pageSize,
    viewMode: "list",
    detailIndex: null,
    confirmingDelete: false,
    deleteConfirmText: "",
    authMode: "none",
    authChoice: undefined,
    authInput: "",
    authPrompt: undefined,
    relayColorMap,
    serverColorMap,
    ignoreRules,
    signer,
    status: "Ready",
    filterMode: false,
    filterText: "",
    switchIdentity: false,
    switchSite: false,
    pubkey,
    blossomServers: [],
    propagationStats: calculatePropagationStats(files, relayColorMap.size, serverColorMap.size),
    siteName,
    hasMultipleSites: hasMultipleSites || false,
  };
}

export function updateFilteredFiles(state: BrowseState): void {
  let filtered = state.files;

  // Apply selected only filter
  if (state.showSelectedOnly && state.selectedItems.size > 0) {
    const selectedPaths = Array.from(state.selectedItems);
    filtered = filtered.filter((file) => {
      const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
      return selectedPaths.includes(path);
    });
  }

  // Apply text filter
  if (state.filterText) {
    const searchTerm = state.filterText.toLowerCase();
    filtered = filtered.filter((file) => {
      const fileName = file.path.split("/").pop() || file.path;
      return fileName.toLowerCase().includes(searchTerm) ||
        file.path.toLowerCase().includes(searchTerm) ||
        file.sha256.toLowerCase().includes(searchTerm);
    });
  }

  state.filteredFiles = filtered;

  // Rebuild tree items
  state.treeItems = buildTreeItems(state.filteredFiles);

  // Reset index and page if needed
  state.selectedIndex = Math.min(state.selectedIndex, state.treeItems.length - 1);
  state.selectedIndex = Math.max(0, state.selectedIndex);

  // Find first file (non-directory) index
  let firstFileIndex = 0;
  for (let i = 0; i < state.treeItems.length; i++) {
    if (!state.treeItems[i].isDirectory) {
      firstFileIndex = i;
      break;
    }
  }
  state.selectedIndex = Math.max(firstFileIndex, state.selectedIndex);

  state.page = 0;

  // Recalculate propagation stats for filtered files
  state.propagationStats = calculatePropagationStats(
    state.filteredFiles,
    state.relayColorMap.size,
    state.serverColorMap.size,
  );
}

export function navigateUp(state: BrowseState): void {
  let newIndex = state.selectedIndex - 1;

  // Skip directories, only navigate to files
  while (newIndex >= 0 && state.treeItems[newIndex].isDirectory) {
    newIndex--;
  }

  if (newIndex >= 0) {
    state.selectedIndex = newIndex;
    if (state.selectedIndex < state.page * state.pageSize) {
      state.page = Math.max(0, state.page - 1);
    }
  }
}

export function navigateDown(state: BrowseState): void {
  let newIndex = state.selectedIndex + 1;

  // Skip directories, only navigate to files
  while (newIndex < state.treeItems.length && state.treeItems[newIndex].isDirectory) {
    newIndex++;
  }

  if (newIndex < state.treeItems.length) {
    state.selectedIndex = newIndex;
    if (state.selectedIndex >= (state.page + 1) * state.pageSize) {
      state.page++;
    }
  }
}

export function navigatePageLeft(state: BrowseState): void {
  if (state.page > 0) {
    state.page--;
    const startIndex = state.page * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, state.treeItems.length);

    // Find first file on the page
    let firstFileIndex = startIndex;
    for (let i = startIndex; i < endIndex; i++) {
      if (!state.treeItems[i].isDirectory) {
        firstFileIndex = i;
        break;
      }
    }
    state.selectedIndex = firstFileIndex;
  }
}

export function navigatePageRight(state: BrowseState): void {
  const maxPage = Math.floor((state.treeItems.length - 1) / state.pageSize);
  if (state.page < maxPage) {
    state.page++;
    const startIndex = state.page * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, state.treeItems.length);

    // Find first file on the page
    let firstFileIndex = startIndex;
    for (let i = startIndex; i < endIndex; i++) {
      if (!state.treeItems[i].isDirectory) {
        firstFileIndex = i;
        break;
      }
    }
    state.selectedIndex = firstFileIndex;
  }
}

export function toggleSelection(state: BrowseState): void {
  const currentItem = state.treeItems[state.selectedIndex];
  if (currentItem && currentItem.file) {
    const path = currentItem.path;
    if (state.selectedItems.has(path)) {
      state.selectedItems.delete(path);
    } else {
      state.selectedItems.add(path);
    }
  }
}

export function deselectAll(state: BrowseState): void {
  state.selectedItems.clear();
}

export function getSelectedFiles(state: BrowseState): FileEntryWithSources[] {
  if (state.selectedItems.size > 0) {
    return Array.from(state.selectedItems)
      .map((path) =>
        state.files.find((f) => (f.path.startsWith("/") ? f.path.substring(1) : f.path) === path)
      )
      .filter((f): f is FileEntryWithSources => f !== undefined);
  }

  const currentItem = state.treeItems[state.selectedIndex];
  if (currentItem && currentItem.file) {
    return [currentItem.file];
  }

  return [];
}

/**
 * Update propagation stats for current state
 */
export function updatePropagationStats(state: BrowseState): void {
  state.propagationStats = calculatePropagationStats(
    state.filteredFiles,
    state.relayColorMap.size,
    state.serverColorMap.size,
  );
}
