import type { BrowseState } from "./state.ts";
import { 
  navigateUp, 
  navigateDown, 
  navigatePageLeft, 
  navigatePageRight, 
  toggleSelection,
  updateFilteredFiles,
  getSelectedFiles
} from "./state.ts";
import { createLogger } from "../../lib/logger.ts";
import type { FileEntryWithSources } from "../../commands/ls.ts";

const log = createLogger("browse-handlers");

export async function handleDeleteConfirmation(
  state: BrowseState,
  key: string,
  sequence?: string
): Promise<boolean> {
  if (key === "escape") {
    state.confirmingDelete = false;
    state.deleteConfirmText = "";
    return true;
  }
  
  if (sequence) {
    state.deleteConfirmText += sequence;
    if (state.deleteConfirmText.toLowerCase() === "yes") {
      const filesToDelete = getSelectedFiles(state);
      const success = await deleteFiles(filesToDelete, state);
      
      if (success) {
        // Remove deleted files from state
        const deletedPaths = new Set(filesToDelete.map(f => f.path));
        state.files = state.files.filter(f => !deletedPaths.has(f.path));
        
        // Clear selections and update filtered files
        state.selectedItems.clear();
        updateFilteredFiles(state);
        
        // Ensure selected index is valid
        state.selectedIndex = Math.min(state.selectedIndex, state.filteredFiles.length - 1);
        state.selectedIndex = Math.max(0, state.selectedIndex);
      }
      
      state.confirmingDelete = false;
      state.deleteConfirmText = "";
      return true;
    }
  }
  
  return true;
}

export async function deleteFiles(
  files: FileEntryWithSources[], 
  state: BrowseState
): Promise<boolean> {
  // TODO: Implement actual deletion logic using nostr events
  log.info(`Deleting ${files.length} file(s)`);
  
  try {
    // Simulate deletion for now
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // In real implementation:
    // 1. Create deletion events for each file
    // 2. Publish to relays
    // 3. Wait for confirmation
    
    return true;
  } catch (error) {
    log.error(`Failed to delete files: ${error}`);
    return false;
  }
}

export function handleListModeKey(state: BrowseState, key: string): boolean {
  switch (key) {
    case "up":
      navigateUp(state);
      return true;
      
    case "down":
      navigateDown(state);
      return true;
      
    case "left":
      navigatePageLeft(state);
      return true;
      
    case "right":
      navigatePageRight(state);
      return true;
      
    case "space":
      toggleSelection(state);
      return true;
      
    case "s":
      state.showSelectedOnly = !state.showSelectedOnly;
      updateFilteredFiles(state);
      return true;
      
    case "return":
      if (state.filteredFiles.length > 0) {
        state.viewMode = "detail";
        state.detailIndex = state.selectedIndex;
      }
      return true;
      
    case "delete":
    case "backspace":
      if (state.filteredFiles.length > 0) {
        state.confirmingDelete = true;
        state.deleteConfirmText = "";
      }
      return true;
      
    case "q":
      return false; // Signal to quit
      
    default:
      return true;
  }
}

export function handleDetailModeKey(state: BrowseState): boolean {
  state.viewMode = "list";
  return true;
}