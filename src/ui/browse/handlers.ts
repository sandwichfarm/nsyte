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
import { render } from "./renderer.ts";

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
      
      // Mark items as being deleted
      filesToDelete.forEach(file => {
        const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
        state.deletingItems.add(path);
      });
      
      state.confirmingDelete = false;
      state.deleteConfirmText = "";
      
      // Start deletion in background
      deleteFiles(filesToDelete, state).then(success => {
        if (success) {
          // Move items from deleting to deleted
          filesToDelete.forEach(file => {
            const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
            state.deletingItems.delete(path);
            state.deletedItems.add(path);
          });
          
          // After 2 seconds, verify deletion and update state
          setTimeout(async () => {
            await verifyDeletion(filesToDelete, state);
          }, 2000);
        } else {
          // Remove from deleting if failed
          filesToDelete.forEach(file => {
            const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
            state.deletingItems.delete(path);
          });
        }
      });
      
      return true;
    }
  }
  
  return true;
}

export async function deleteFiles(
  files: FileEntryWithSources[], 
  state: BrowseState
): Promise<boolean> {
  log.info(`Deleting ${files.length} file(s)`);
  
  try {
    // Import required modules dynamically to avoid circular dependencies
    const { createDeleteEvent, publishEventsToRelays } = await import("../../lib/nostr.ts");
    const { readProjectFile } = await import("../../lib/config.ts");
    
    // Get config to determine signer
    const config = readProjectFile();
    if (!config) {
      log.error("No config found");
      return false;
    }
    
    if (!state.signer) {
      log.error("No signer available for deletion. Please provide authentication.");
      return false;
    }
    
    // Extract event IDs from files that have events
    const eventIds = files
      .filter(f => f.event)
      .map(f => f.eventId);
    
    if (eventIds.length === 0) {
      log.warn("No events to delete");
      return false;
    }
    
    // Get relays from deleted files
    const relays = new Set<string>();
    files.forEach(file => {
      file.foundOnRelays.forEach(relay => relays.add(relay));
    });
    
    log.info(`Creating delete event for ${eventIds.length} events`);
    
    // Create delete event
    const deleteEvent = await createDeleteEvent(state.signer, eventIds);
    
    // Publish to relays
    const success = await publishEventsToRelays(Array.from(relays), [deleteEvent]);
    
    if (!success) {
      log.error("Failed to publish delete event to any relay");
      return false;
    }
    
    log.info(`Delete event published successfully`);
    return true
    
  } catch (error) {
    log.error(`Failed to delete files: ${error}`);
    return false;
  }
}

async function verifyDeletion(files: FileEntryWithSources[], state: BrowseState): Promise<void> {
  try {
    const { fetchFileEvents } = await import("../../lib/nostr.ts");
    
    // Get the pubkey from the first file's event
    if (files.length === 0 || !files[0].event) return;
    const pubkey = files[0].event.pubkey;
    
    // Get all relays where files were found
    const relays = new Set<string>();
    files.forEach(file => {
      file.foundOnRelays.forEach(relay => relays.add(relay));
    });
    
    // Check if events still exist
    const eventIds = files.map(f => f.eventId);
    const existingEvents = await fetchFileEvents(Array.from(relays), pubkey);
    const existingEventIds = new Set(existingEvents.filter(e => eventIds.includes(e.id)).map(e => e.id));
    
    // Remove files that were successfully deleted
    const deletedPaths = files
      .filter(f => !existingEventIds.has(f.eventId))
      .map(f => f.path);
    
    if (deletedPaths.length > 0) {
      // Remove deleted files from state
      state.files = state.files.filter(f => !deletedPaths.includes(f.path));
      
      // Clear items from tracking sets
      deletedPaths.forEach(path => {
        const normalizedPath = path.startsWith("/") ? path.substring(1) : path;
        state.deletedItems.delete(normalizedPath);
        state.selectedItems.delete(normalizedPath);
      });
      
      // Update filtered files and re-render
      updateFilteredFiles(state);
      
      // Ensure selected index is valid
      state.selectedIndex = Math.min(state.selectedIndex, state.filteredFiles.length - 1);
      state.selectedIndex = Math.max(0, state.selectedIndex);
      
      // Re-render to show updated list
      render(state);
    }
    
    // Clear any remaining items from deleted tracking
    files.forEach(file => {
      const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
      state.deletedItems.delete(path);
    });
    
  } catch (error) {
    log.error(`Failed to verify deletion: ${error}`);
    // Clear all tracking on error
    files.forEach(file => {
      const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
      state.deletingItems.delete(path);
      state.deletedItems.delete(path);
    });
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
      const currentItem = state.treeItems[state.selectedIndex];
      if (currentItem && currentItem.file) {
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