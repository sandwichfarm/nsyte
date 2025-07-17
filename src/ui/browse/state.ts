import type { FileEntryWithSources } from "../../commands/ls.ts";
import type { IgnoreRule } from "../../lib/files.ts";

export interface BrowseState {
  files: FileEntryWithSources[];
  filteredFiles: FileEntryWithSources[];
  selectedIndex: number;
  selectedItems: Set<number>;
  showSelectedOnly: boolean;
  page: number;
  pageSize: number;
  viewMode: "list" | "detail";
  detailIndex: number | null;
  confirmingDelete: boolean;
  deleteConfirmText: string;
  relayColorMap: Map<string, (str: string) => string>;
  serverColorMap: Map<string, (str: string) => string>;
  ignoreRules: IgnoreRule[];
}

export function createInitialState(
  files: FileEntryWithSources[],
  pageSize: number,
  relayColorMap: Map<string, (str: string) => string>,
  serverColorMap: Map<string, (str: string) => string>,
  ignoreRules: IgnoreRule[]
): BrowseState {
  return {
    files,
    filteredFiles: files,
    selectedIndex: 0,
    selectedItems: new Set(),
    showSelectedOnly: false,
    page: 0,
    pageSize,
    viewMode: "list",
    detailIndex: null,
    confirmingDelete: false,
    deleteConfirmText: "",
    relayColorMap,
    serverColorMap,
    ignoreRules,
  };
}

export function updateFilteredFiles(state: BrowseState): void {
  if (state.showSelectedOnly && state.selectedItems.size > 0) {
    const selectedIndices = Array.from(state.selectedItems);
    state.filteredFiles = selectedIndices
      .map(index => state.files[index])
      .filter(Boolean);
  } else {
    state.filteredFiles = state.files;
  }
  
  // Reset index and page if needed
  state.selectedIndex = Math.min(state.selectedIndex, state.filteredFiles.length - 1);
  state.page = 0;
}

export function navigateUp(state: BrowseState): void {
  if (state.selectedIndex > 0) {
    state.selectedIndex--;
    if (state.selectedIndex < state.page * state.pageSize) {
      state.page--;
    }
  }
}

export function navigateDown(state: BrowseState): void {
  if (state.selectedIndex < state.filteredFiles.length - 1) {
    state.selectedIndex++;
    if (state.selectedIndex >= (state.page + 1) * state.pageSize) {
      state.page++;
    }
  }
}

export function navigatePageLeft(state: BrowseState): void {
  if (state.page > 0) {
    state.page--;
    state.selectedIndex = state.page * state.pageSize;
  }
}

export function navigatePageRight(state: BrowseState): void {
  const maxPage = Math.floor((state.filteredFiles.length - 1) / state.pageSize);
  if (state.page < maxPage) {
    state.page++;
    state.selectedIndex = state.page * state.pageSize;
  }
}

export function toggleSelection(state: BrowseState): void {
  if (state.selectedItems.has(state.selectedIndex)) {
    state.selectedItems.delete(state.selectedIndex);
  } else {
    state.selectedItems.add(state.selectedIndex);
  }
}

export function getSelectedFiles(state: BrowseState): FileEntryWithSources[] {
  if (state.selectedItems.size > 0) {
    return Array.from(state.selectedItems)
      .map(i => state.filteredFiles[i])
      .filter(Boolean);
  }
  return [state.filteredFiles[state.selectedIndex]].filter(Boolean);
}