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
import { colors } from "@cliffy/ansi/colors";

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
      
      // Update status
      state.status = `Deleting ${filesToDelete.length} file${filesToDelete.length > 1 ? 's' : ''}...`;
      state.statusColor = colors.yellow;
      render(state);
      
      // Start deletion in background
      deleteFiles(filesToDelete, state).then(success => {
        if (success) {
          // Move items from deleting to deleted
          filesToDelete.forEach(file => {
            const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
            state.deletingItems.delete(path);
            state.deletedItems.add(path);
          });
          
          // Update status
          state.status = `Deleted ${filesToDelete.length} file${filesToDelete.length > 1 ? 's' : ''}. Verifying...`;
          state.statusColor = colors.green;
          render(state);
          
          // After 2 seconds, verify deletion and update state
          setTimeout(async () => {
            state.status = "Verifying deletion...";
            state.statusColor = colors.cyan;
            render(state);
            await verifyDeletion(filesToDelete, state);
          }, 2000);
        } else {
          // Remove from deleting if failed
          filesToDelete.forEach(file => {
            const path = file.path.startsWith("/") ? file.path.substring(1) : file.path;
            state.deletingItems.delete(path);
          });
          
          // Update status
          state.status = "Delete failed";
          state.statusColor = colors.red;
          render(state);
          
          // Reset status after 3 seconds
          setTimeout(() => {
            state.status = "Ready";
            state.statusColor = undefined;
            render(state);
          }, 3000);
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
    const { createSigner } = await import("../../lib/auth/signer-factory.ts");
    const { Confirm, Select, Secret } = await import("@cliffy/prompt");
    
    // Get config to check for bunker
    const config = readProjectFile();
    
    // Try to create signer from CLI options or config
    let signer = undefined;
    if (state.authOptions?.privatekey || state.authOptions?.bunker || state.authOptions?.nbunksec || config?.bunkerPubkey) {
      const signerResult = await createSigner({
        privateKey: state.authOptions?.privatekey,
        bunkerUrl: state.authOptions?.bunker,
        nbunksec: state.authOptions?.nbunksec,
        bunkerPubkey: config?.bunkerPubkey
      });
      
      if ('error' in signerResult) {
        log.error(signerResult.error);
        
        // Prompt for authentication
        console.log(colors.yellow("\nNo signer available for deletion."));
        const useAuth = await Confirm.prompt({
          message: "Would you like to provide authentication?",
          default: true
        });
        
        if (!useAuth) {
          state.status = "Delete cancelled";
          state.statusColor = colors.yellow;
          render(state);
          return false;
        }
        
        const authChoice = await Select.prompt({
          message: "Choose authentication method:",
          options: [
            { name: "Private Key (hex)", value: "hex" },
            { name: "Private Key (nsec)", value: "nsec" },
            { name: "NostrBunker (nbunksec)", value: "nbunksec" }
          ]
        });
        
        let authInput;
        if (authChoice === "nbunksec") {
          authInput = await Secret.prompt({
            message: "Enter nbunksec:"
          });
          
          const nbunksecSigner = await createSigner({ nbunksec: authInput });
          if ('error' in nbunksecSigner) {
            console.error(colors.red(nbunksecSigner.error));
            authInput = undefined; // Clear from memory
            state.status = "Delete failed: Invalid nbunksec";
            state.statusColor = colors.red;
            return false;
          }
          signer = nbunksecSigner.signer;
        } else {
          authInput = await Secret.prompt({
            message: `Enter ${authChoice === "hex" ? "hex private key" : "nsec"}:`
          });
          
          const privateKeySigner = await createSigner({ privateKey: authInput });
          if ('error' in privateKeySigner) {
            console.error(colors.red(privateKeySigner.error));
            authInput = undefined; // Clear from memory
            state.status = "Delete failed: Invalid private key";
            state.statusColor = colors.red;
            return false;
          }
          signer = privateKeySigner.signer;
        }
        
        // Clear sensitive data from memory immediately
        authInput = undefined;
      } else {
        signer = signerResult.signer;
      }
    } else {
      // No auth options provided, prompt for authentication
      console.log(colors.yellow("\nAuthentication required for deletion."));
      const authChoice = await Select.prompt({
        message: "Choose authentication method:",
        options: [
          { name: "Private Key (hex)", value: "hex" },
          { name: "Private Key (nsec)", value: "nsec" },
          { name: "NostrBunker (nbunksec)", value: "nbunksec" }
        ]
      });
      
      let authInput;
      if (authChoice === "nbunksec") {
        authInput = await Secret.prompt({
          message: "Enter nbunksec:"
        });
        
        const nbunksecSigner = await createSigner({ nbunksec: authInput });
        if ('error' in nbunksecSigner) {
          console.error(colors.red(nbunksecSigner.error));
          authInput = undefined; // Clear from memory
          state.status = "Delete failed: Invalid nbunksec";
          state.statusColor = colors.red;
          return false;
        }
        signer = nbunksecSigner.signer;
      } else {
        authInput = await Secret.prompt({
          message: `Enter ${authChoice === "hex" ? "hex private key" : "nsec"}:`
        });
        
        const privateKeySigner = await createSigner({ privateKey: authInput });
        if ('error' in privateKeySigner) {
          console.error(colors.red(privateKeySigner.error));
          authInput = undefined; // Clear from memory
          state.status = "Delete failed: Invalid private key";
          state.statusColor = colors.red;
          return false;
        }
        signer = privateKeySigner.signer;
      }
      
      // Clear sensitive data from memory immediately
      authInput = undefined;
    }
    
    if (!signer) {
      log.error("Failed to create signer");
      state.status = "Delete failed: No signer available";
      state.statusColor = colors.red;
      return false;
    }
    
    // Extract event IDs from files that have events
    const eventIds = files
      .filter(f => f.event)
      .map(f => f.eventId);
    
    if (eventIds.length === 0) {
      log.warn("No events to delete");
      state.status = "Delete failed: No events found for selected files";
      state.statusColor = colors.red;
      return false;
    }
    
    // Get relays from deleted files
    const relays = new Set<string>();
    files.forEach(file => {
      file.foundOnRelays.forEach(relay => relays.add(relay));
    });
    
    log.info(`Creating delete event for ${eventIds.length} events`);
    
    // Update status
    state.status = "Creating delete event...";
    state.statusColor = colors.cyan;
    render(state);
    
    // Create delete event
    const deleteEvent = await createDeleteEvent(state.signer, eventIds);
    
    // Update status
    state.status = `Publishing to ${relays.size} relay${relays.size > 1 ? 's' : ''}...`;
    render(state);
    
    // Publish to relays with detailed results
    const relayArray = Array.from(relays);
    let acceptedCount = 0;
    let rejectedCount = 0;
    const rejectedRelays: string[] = [];
    
    try {
      // Import pool for direct access
      const { pool } = await import("../../lib/nostr.ts");
      const { lastValueFrom, toArray, timeout } = await import("rxjs");
      
      // Publish to each relay and track results
      const publishPromises = relayArray.map(async (relay) => {
        try {
          state.status = `Publishing to ${relay.replace(/^wss?:\/\//, '').substring(0, 20)}...`;
          render(state);
          
          const results = await lastValueFrom(
            pool.publish([relay], deleteEvent, { retries: 1 })
              .pipe(timeout(5000), toArray())
          );
          
          // Check if any results indicate success
          const success = results.some(r => r.ok);
          if (success) {
            acceptedCount++;
            log.info(`Delete event accepted by ${relay}`);
          } else {
            rejectedCount++;
            rejectedRelays.push(relay);
            log.warn(`Delete event rejected by ${relay}`);
          }
        } catch (error) {
          // Timeout or connection error
          rejectedCount++;
          rejectedRelays.push(relay);
          log.error(`Failed to publish to ${relay}: ${error}`);
        }
      });
      
      await Promise.all(publishPromises);
      
      if (acceptedCount === 0) {
        log.error("All relays rejected the delete event");
        state.status = `Delete failed: All ${rejectedCount} relay${rejectedCount > 1 ? 's' : ''} rejected the event`;
        state.statusColor = colors.red;
        return false;
      } else if (rejectedCount > 0) {
        log.warn(`Delete event accepted by ${acceptedCount} relay(s), rejected by ${rejectedCount}`);
        state.status = `Delete partially successful: ${acceptedCount} accepted, ${rejectedCount} rejected`;
        state.statusColor = colors.yellow;
      }
    } catch (error) {
      log.error(`Error during relay publication: ${error}`);
      state.status = `Delete failed: ${error instanceof Error ? error.message : 'Relay communication error'}`;
      state.statusColor = colors.red;
      return false;
    }
    
    log.info(`Delete event published successfully`);
    
    // Clear signer from memory immediately after use
    signer = undefined;
    
    return true
    
  } catch (error) {
    log.error(`Failed to delete files: ${error}`);
    state.status = `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    state.statusColor = colors.red;
    return false;
  }
}

async function verifyDeletion(files: FileEntryWithSources[], state: BrowseState): Promise<void> {
  try {
    const { pool } = await import("../../lib/nostr.ts");
    const { lastValueFrom, toArray, timeout } = await import("rxjs");
    
    // Get the pubkey from the first file's event
    if (files.length === 0 || !files[0].event) return;
    const pubkey = files[0].event.pubkey;
    
    // Check each relay individually to see which still have the events
    const eventIds = files.map(f => f.eventId);
    const stillExistsOn = new Map<string, Set<string>>(); // eventId -> relays that still have it
    
    for (const file of files) {
      stillExistsOn.set(file.eventId, new Set());
      
      // Check each relay where this file was found
      for (const relay of file.foundOnRelays) {
        try {
          const filter = {
            ids: [file.eventId],
            authors: [pubkey],
            kinds: [1063]
          };
          
          const events = await lastValueFrom(
            pool.query([relay], filter)
              .pipe(timeout(3000), toArray())
          );
          
          if (events.length > 0) {
            // Event still exists on this relay
            stillExistsOn.get(file.eventId)!.add(relay);
          }
        } catch (error) {
          // Relay timeout or error - assume event might still exist
          log.warn(`Could not verify deletion on ${relay}: ${error}`);
        }
      }
    }
    
    // Categorize results
    const fullyDeleted: string[] = [];
    const partiallyDeleted: string[] = [];
    const notDeleted: string[] = [];
    
    files.forEach(file => {
      const remainingRelays = stillExistsOn.get(file.eventId) || new Set();
      if (remainingRelays.size === 0) {
        fullyDeleted.push(file.path);
      } else if (remainingRelays.size < file.foundOnRelays.length) {
        partiallyDeleted.push(file.path);
      } else {
        notDeleted.push(file.path);
      }
    });
    
    if (fullyDeleted.length > 0) {
      // Remove fully deleted files from state
      state.files = state.files.filter(f => !fullyDeleted.includes(f.path));
      
      // Clear items from tracking sets
      fullyDeleted.forEach(path => {
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
      state.status = `Verified: ${fullyDeleted.length} removed`;
      state.statusColor = colors.green;
      render(state);
      
      // Reset status after 2 seconds
      setTimeout(() => {
        state.status = "Ready";
        state.statusColor = undefined;
        render(state);
      }, 2000);
    } else if (partiallyDeleted.length > 0) {
      // Some files partially deleted
      state.status = `Warning: ${partiallyDeleted.length} file${partiallyDeleted.length > 1 ? 's' : ''} still on some relays`;
      state.statusColor = colors.yellow;
      render(state);
      
      // Show detailed info in console
      console.log(colors.yellow("\nPartially deleted files (still exist on some relays):"));
      partiallyDeleted.forEach(path => {
        const file = files.find(f => f.path === path);
        if (file) {
          const remaining = stillExistsOn.get(file.eventId) || new Set();
          console.log(`  ${path}: Still on ${Array.from(remaining).join(", ")}`);
        }
      });
      
      // Reset status after 5 seconds
      setTimeout(() => {
        state.status = "Ready";
        state.statusColor = undefined;
        render(state);
      }, 5000);
    } else if (notDeleted.length > 0) {
      // No files were successfully deleted
      state.status = `Delete accepted but ${notDeleted.length} file${notDeleted.length > 1 ? 's' : ''} still exist on all relays`;
      state.statusColor = colors.red;
      render(state);
      
      // Reset status after 5 seconds
      setTimeout(() => {
        state.status = "Ready";
        state.statusColor = undefined;
        render(state);
      }, 5000);
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
      
    case "/":
      // Activate filter mode
      state.filterMode = true;
      state.filterText = "";
      state.status = "Filter: ";
      state.statusColor = colors.cyan;
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

export function handleFilterMode(state: BrowseState, key: string, sequence?: string): boolean {
  if (key === "escape") {
    // Cancel filter
    state.filterMode = false;
    state.filterText = "";
    state.status = "Ready";
    state.statusColor = undefined;
    updateFilteredFiles(state);
    return true;
  }
  
  if (key === "return") {
    // Apply filter and exit filter mode
    state.filterMode = false;
    state.status = state.filterText ? `Filtered: ${state.filterText}` : "Ready";
    state.statusColor = state.filterText ? colors.cyan : undefined;
    return true;
  }
  
  if (key === "backspace") {
    // Remove last character
    if (state.filterText.length > 0) {
      state.filterText = state.filterText.slice(0, -1);
      updateFilteredFiles(state);
    }
    return true;
  }
  
  if (sequence && sequence.length === 1 && sequence >= ' ') {
    // Add character to filter
    state.filterText += sequence;
    updateFilteredFiles(state);
  }
  
  return true;
}