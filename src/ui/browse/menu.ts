import { colors } from "@cliffy/ansi/colors";
import { Keypress } from "@cliffy/keypress";
import { hexToBytes } from "@noble/hashes/utils";
import {
  decodePointer,
  generateSecretKey,
  getPublicKey,
  npubEncode,
  nsecEncode,
} from "applesauce-core/helpers";
import type { SiteInfo } from "../../lib/browse-loader.ts";
import { SecretsManager } from "../../lib/secrets/mod.ts";
import {
  clearScreen,
  enterAlternateScreen,
  exitAlternateScreen,
  getTerminalSize,
  hideCursor,
  moveCursor,
  showCursor,
} from "./renderer.ts";

interface MenuItem {
  label: string;
  value: string;
  type: "bunker" | "action";
}

export async function showBunkerMenu(
  currentPubkey?: string,
): Promise<{ type: string; value: string }> {
  // This is the same as showBrowseMenu but can be called from other commands
  return await showBrowseMenu(currentPubkey);
}

export async function showBrowseMenu(
  currentPubkey?: string,
): Promise<{ type: "pubkey" | "privatekey" | "bunker" | "npub"; value: string }> {
  enterAlternateScreen();
  hideCursor();

  try {
    // Get existing bunkers
    const secretsManager = SecretsManager.getInstance();
    const bunkerPubkeys = await secretsManager.getAllPubkeys();

    // Build menu items
    const menuItems: MenuItem[] = [];

    // Add bunker options
    bunkerPubkeys.forEach((pubkey) => {
      const npub = npubEncode(pubkey);
      menuItems.push({
        label: `${npub}`,
        value: pubkey,
        type: "bunker",
      });
    });

    // Add separator if there are bunkers
    if (bunkerPubkeys.length > 0) {
      menuItems.push({ label: "─".repeat(40), value: "", type: "action" });
    }

    // Add action options
    menuItems.push(
      { label: "Enter npub manually", value: "enter_npub", type: "action" },
      { label: "─".repeat(40), value: "", type: "action" },
      { label: "Generate a new private key", value: "generate", type: "action" },
      { label: "Use an existing private key", value: "existing", type: "action" },
      { label: "Connect to NSEC bunker", value: "bunker", type: "action" },
    );

    // Filter out separators from selectable items
    const selectableItems = menuItems.filter((item) => item.value !== "");

    // Find current identity in the list
    let selectedIndex = 0;
    if (currentPubkey) {
      const currentIndex = selectableItems.findIndex((item) =>
        item.type === "bunker" && item.value === currentPubkey
      );
      if (currentIndex !== -1) {
        selectedIndex = currentIndex;
      }
    }

    // Render loop
    while (true) {
      clearScreen();
      const { rows, cols } = getTerminalSize();

      // Calculate vertical centering
      const totalHeight = menuItems.length + 6; // Title + subtitle + spacing
      const startRow = Math.max(1, Math.floor((rows - totalHeight) / 2));

      // Render title
      const title = "nsyte browse";
      const titleCol = Math.floor((cols - title.length) / 2);
      moveCursor(startRow, titleCol);
      console.log(colors.bold.cyan(title));

      // Render subtitle
      const subtitle = "Select a nostr identity to browse:";
      const subtitleCol = Math.floor((cols - subtitle.length) / 2);
      moveCursor(startRow + 2, subtitleCol);
      console.log(colors.gray(subtitle));

      // Render menu items
      let menuRow = startRow + 4;
      let selectableCounter = 0;

      menuItems.forEach((item) => {
        const isSelectable = item.value !== "";
        const isSelected = isSelectable && selectableCounter === selectedIndex;

        let label = item.label;
        let displayLabel = label;

        if (item.type === "bunker") {
          // Check if this is the current identity
          const isCurrent = currentPubkey && item.value === currentPubkey;
          if (isCurrent) {
            displayLabel = `${label} ✓`;
          }

          // Truncate npub if needed to fit screen
          const maxWidth = cols - 10;
          if (displayLabel.length > maxWidth) {
            if (isCurrent) {
              // Keep the checkmark at the end
              label = label.substring(0, maxWidth - 5) + "...";
              displayLabel = `${label} ✓`;
            } else {
              displayLabel = label.substring(0, maxWidth - 3) + "...";
            }
          }
        }

        const labelCol = Math.floor((cols - displayLabel.length) / 2);
        moveCursor(menuRow, labelCol);

        if (item.value === "") {
          // Separator
          console.log(colors.gray(displayLabel));
        } else if (isSelected) {
          console.log(colors.bgMagenta.white(` ${displayLabel} `));
        } else if (item.type === "bunker") {
          // Check if this is the current identity
          const isCurrent = currentPubkey && item.value === currentPubkey;
          if (isCurrent) {
            console.log(colors.green(displayLabel));
          } else {
            console.log(colors.cyan(displayLabel));
          }
        } else {
          console.log(colors.white(displayLabel));
        }

        if (isSelectable) {
          selectableCounter++;
        }
        menuRow++;
      });

      // Show help text
      const helpText = "↑/↓ Navigate • ENTER Select • q Quit";
      const helpCol = Math.floor((cols - helpText.length) / 2);
      moveCursor(rows - 2, helpCol);
      console.log(colors.gray(helpText));

      // Handle keypress
      const keypress = new Keypress();
      for await (const event of keypress) {
        if (event.key === "up") {
          selectedIndex = Math.max(0, selectedIndex - 1);
          break;
        } else if (event.key === "down") {
          selectedIndex = Math.min(selectableItems.length - 1, selectedIndex + 1);
          break;
        } else if (event.key === "return") {
          const selected = selectableItems[selectedIndex];
          keypress.dispose();

          exitAlternateScreen();
          showCursor();

          // Handle selection
          if (selected.type === "bunker") {
            return { type: "bunker", value: selected.value };
          }

          switch (selected.value) {
            case "enter_npub": {
              const { Input } = await import("@cliffy/prompt");
              const npubInput = await Input.prompt({
                message: "Enter npub:",
                validate: (value) => {
                  try {
                    const decoded = decodePointer(value);
                    if (decoded.type !== "npub") {
                      return "Invalid npub format";
                    }
                    return true;
                  } catch {
                    return "Invalid npub format";
                  }
                },
              });

              const decoded = decodePointer(npubInput);
              if (decoded.type === "npub") {
                return { type: "npub", value: decoded.data };
              }
              throw new Error("Invalid npub");
            }

            case "generate": {
              const sk = generateSecretKey();
              const pk = getPublicKey(sk);
              console.log(colors.green("\nGenerated new private key"));
              console.log(colors.yellow("⚠️  Save this key - it won't be shown again!"));
              console.log(colors.bold(`nsec: ${nsecEncode(sk)}`));
              console.log(colors.bold(`npub: ${npubEncode(pk)}`));

              const { Confirm } = await import("@cliffy/prompt");
              await Confirm.prompt({
                message: "Press Enter when you've saved the key",
                default: true,
              });

              return { type: "pubkey", value: pk };
            }

            case "existing": {
              const { Secret } = await import("@cliffy/prompt");
              const keyInput = await Secret.prompt({
                message: "Enter private key (nsec/hex):",
              });

              let privKey: Uint8Array;
              if (keyInput.startsWith("nsec")) {
                const decoded = decodePointer(keyInput);
                if (decoded.type !== "nsec") {
                  throw new Error("Invalid nsec");
                }
                privKey = decoded.data as Uint8Array;
              } else {
                privKey = hexToBytes(keyInput);
              }

              const pubkey = getPublicKey(privKey);
              return { type: "privatekey", value: pubkey };
            }

            case "bunker": {
              // Redirect to bunker connect
              console.log(colors.yellow("\nPlease use 'nsyte bunker connect' to add a new bunker"));
              Deno.exit(0);
            }
          }

          throw new Error("Invalid selection");
        } else if (event.key === "q") {
          keypress.dispose();
          exitAlternateScreen();
          showCursor();
          Deno.exit(0);
        }
      }
    }
  } catch (error) {
    exitAlternateScreen();
    showCursor();
    throw error;
  }
}

/**
 * Show site selection menu
 * Returns the selected site identifier (null for root site, string for named site)
 */
export async function showSiteSelectionMenu(
  sites: SiteInfo[],
): Promise<string | null> {
  enterAlternateScreen();
  hideCursor();

  try {
    // Build menu items
    interface SiteMenuItem {
      label: string;
      value: string | null | "separator";
      fileCount: number;
    }

    const menuItems: SiteMenuItem[] = [];

    // Add root site if exists
    const rootSite = sites.find((s) => s.type === "root");
    if (rootSite) {
      menuItems.push({
        label: `${rootSite.title} (${rootSite.fileCount} files)`,
        value: null,
        fileCount: rootSite.fileCount,
      });
    }

    // Add named sites
    const namedSites = sites.filter((s) => s.type === "named");
    if (namedSites.length > 0) {
      for (const site of namedSites) {
        menuItems.push({
          label: `${site.title} (${site.fileCount} files)`,
          value: site.identifier!,
          fileCount: site.fileCount,
        });
      }
    }

    // Filter out separators from selectable items
    const selectableItems = menuItems.filter((item) => item.value !== "separator");
    let selectedIndex = 0;

    // Render loop
    while (true) {
      clearScreen();
      const { rows, cols } = getTerminalSize();

      // Calculate vertical centering
      const totalHeight = menuItems.length + 6;
      const startRow = Math.max(1, Math.floor((rows - totalHeight) / 2));

      // Render title
      const title = "Select Site to Browse";
      const titleCol = Math.floor((cols - title.length) / 2);
      moveCursor(startRow, titleCol);
      console.log(colors.bold.cyan(title));

      // Render subtitle
      const subtitle = `Found ${sites.length} site${sites.length !== 1 ? "s" : ""}`;
      const subtitleCol = Math.floor((cols - subtitle.length) / 2);
      moveCursor(startRow + 2, subtitleCol);
      console.log(colors.gray(subtitle));

      // Render menu items
      let menuRow = startRow + 4;
      let selectableCounter = 0;

      menuItems.forEach((item) => {
        const isSelectable = item.value !== "separator";
        const isSelected = isSelectable && selectableCounter === selectedIndex;

        const displayLabel = item.label;
        const labelCol = Math.floor((cols - displayLabel.length) / 2);
        moveCursor(menuRow, labelCol);

        if (item.value === "separator") {
          console.log(colors.gray(displayLabel));
        } else if (isSelected) {
          console.log(colors.bgMagenta.white(` ${displayLabel} `));
        } else if (item.value === null) {
          // Root site
          console.log(colors.cyan(displayLabel));
        } else {
          // Named sites
          console.log(colors.green(displayLabel));
        }

        if (isSelectable) {
          selectableCounter++;
        }
        menuRow++;
      });

      // Show help text
      const helpText = "↑/↓ Navigate • ENTER Select • q Quit";
      const helpCol = Math.floor((cols - helpText.length) / 2);
      moveCursor(rows - 2, helpCol);
      console.log(colors.gray(helpText));

      // Handle keypress
      const keypress = new Keypress();
      for await (const event of keypress) {
        if (event.key === "up") {
          selectedIndex = Math.max(0, selectedIndex - 1);
          break;
        } else if (event.key === "down") {
          selectedIndex = Math.min(selectableItems.length - 1, selectedIndex + 1);
          break;
        } else if (event.key === "return") {
          const selected = selectableItems[selectedIndex];
          keypress.dispose();
          exitAlternateScreen();
          showCursor();
          return selected.value;
        } else if (event.key === "q") {
          keypress.dispose();
          exitAlternateScreen();
          showCursor();
          Deno.exit(0);
        }
      }
    }
  } catch (error) {
    exitAlternateScreen();
    showCursor();
    throw error;
  }
}
