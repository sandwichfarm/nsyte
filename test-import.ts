// Test imports from nostr-tools
import * as nostrTools from "npm:nostr-tools";

// Log the available exports
console.log("Available exports from nostr-tools:");
console.log(Object.keys(nostrTools));

// Log what's in the nip47 module
console.log("\nNIP-47 module contents:");
console.log(Object.keys(nostrTools.nip47));

// Check specific functions we need
console.log("\nChecking for specific functions:");
console.log("- generateSecretKey:", typeof nostrTools.generateSecretKey);
console.log("- getPublicKey:", typeof nostrTools.getPublicKey);
console.log("- nip04 encrypt:", typeof nostrTools.nip04?.encrypt);
console.log("- nip04 decrypt:", typeof nostrTools.nip04?.decrypt);

// Check if we can access the specific functions we need
console.log("\nChecking for specific functions:");
console.log("- generateSecretKey:", typeof nostrTools.generateSecretKey);
console.log("- getPublicKey:", typeof nostrTools.getPublicKey);
console.log("- nip04:", typeof nostrTools.nip04);
console.log("- nip46:", typeof nostrTools.nip46);

// Check if it contains the BunkerSigner class
if (nostrTools.nip47.BunkerSigner) {
  console.log("\nBunkerSigner exists in nip47!");
} else {
  console.log("\nBunkerSigner not found in nip47 :(");
  
  // Let's log all the keys of each nip module to see if it's somewhere else
  for (const key of Object.keys(nostrTools)) {
    if (key.startsWith('nip') && typeof nostrTools[key] === 'object') {
      console.log(`\n${key} module contents:`);
      console.log(Object.keys(nostrTools[key]));
    }
  }
} 