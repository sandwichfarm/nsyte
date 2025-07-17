import { colors } from "@cliffy/ansi/colors";
import { Keypress } from "@cliffy/keypress";
import { enterAlternateScreen, exitAlternateScreen, clearScreen, hideCursor, showCursor, moveCursor, getTerminalSize } from "./renderer.ts";
import { SecretsManager } from "../../lib/secrets/mod.ts";
import { nip19, getPublicKey, generateSecretKey } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

interface MenuItem {
  label: string;
  value: string;
  type: "bunker" | "action";
}

export async function showBrowseMenu(currentPubkey?: string): Promise<{ type: "pubkey" | "privatekey" | "bunker" | "npub"; value: string }> {
  enterAlternateScreen();
  hideCursor();
  
  try {
    // Get existing bunkers
    const secretsManager = SecretsManager.getInstance();
    const bunkerPubkeys = await secretsManager.getAllPubkeys();
    
    // Build menu items
    const menuItems: MenuItem[] = [];
    
    // Add bunker options
    bunkerPubkeys.forEach(pubkey => {
      const npub = nip19.npubEncode(pubkey);
      menuItems.push({ 
        label: `${npub}`, 
        value: pubkey,
        type: "bunker"
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
      { label: "Connect to NSEC bunker", value: "bunker", type: "action" }
    );
    
    // Filter out separators from selectable items
    const selectableItems = menuItems.filter(item => item.value !== "");
    
    // Find current identity in the list
    let selectedIndex = 0;
    if (currentPubkey) {
      const currentIndex = selectableItems.findIndex(item => 
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
                    const decoded = nip19.decode(value);
                    if (decoded.type !== "npub") {
                      return "Invalid npub format";
                    }
                    return true;
                  } catch {
                    return "Invalid npub format";
                  }
                }
              });
              
              const decoded = nip19.decode(npubInput);
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
              console.log(colors.bold(`nsec: ${nip19.nsecEncode(sk)}`));
              console.log(colors.bold(`npub: ${nip19.npubEncode(pk)}`));
              
              const { Confirm } = await import("@cliffy/prompt");
              await Confirm.prompt({
                message: "Press Enter when you've saved the key",
                default: true
              });
              
              return { type: "pubkey", value: pk };
            }
            
            case "existing": {
              const { Secret } = await import("@cliffy/prompt");
              const keyInput = await Secret.prompt({
                message: "Enter private key (nsec/hex):"
              });
              
              let privKey: Uint8Array;
              if (keyInput.startsWith("nsec")) {
                const decoded = nip19.decode(keyInput);
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