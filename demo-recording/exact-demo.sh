#!/bin/bash
# Exact nsyte demo script based on actual source code

# Function to simulate typing
type_out() {
    echo -n "$ "
    for (( i=0; i<${#1}; i++ )); do
        echo -n "${1:$i:1}"
        sleep 0.04
    done
    echo
    sleep 0.3
}

# Function to simulate prompt input
type_input() {
    for (( i=0; i<${#1}; i++ )); do
        echo -n "${1:$i:1}"
        sleep 0.06
    done
    echo
    sleep 0.3
}

# Function to show output
show_output() {
    echo "$1"
    sleep 0.15
}

# Start the demo
clear

# Initial command
type_out "nsyte init"
sleep 0.5

show_output ""
show_output "No existing project configuration found. Setting up a new one:"
show_output ""
sleep 0.5
show_output "Welcome to nsyte setup!"
show_output ""
sleep 0.5

# Key management prompt
show_output "? How would you like to manage your nostr key? (Use arrow keys)"
show_output "❯ Generate a new private key"
show_output "  Use an existing private key"
show_output "  Connect to an NSEC bunker"
sleep 1.5
show_output ""

# Select bunker option (simulating arrow down twice)
show_output "? How would you like to manage your nostr key?"
show_output "  Generate a new private key"
show_output "  Use an existing private key"
show_output "❯ Connect to an NSEC bunker"
sleep 0.8
show_output ""

# Bunker connection method
show_output "? How would you like to connect to the bunker? (Use arrow keys)"
show_output "❯ Scan QR Code (Nostr Connect)"
show_output "  Enter Bunker URL manually"
sleep 1
show_output ""

# Relay prompt
show_output "? Enter relays (comma-separated), or press Enter for default (wss://relay.nsec.app):"
type_input ""
show_output ""

# Show connection process
show_output "Initiating Nostr Connect as 'nsyte' on relays: wss://relay.nsec.app"
show_output "Please scan the QR code with your NIP-46 compatible signer (e.g., mobile wallet):"
show_output ""

# QR code representing the nostr+walletconnect URI (generated for YouTube link as example)
echo "████████████████████████████████████████████████████████████████████"
echo "████████████████████████████████████████████████████████████████████"
echo "██████████  ██████  ████  ██  ████      ██████  ████  ██████  ██████"
echo "██████████  ██████  ████  ██      ██████      ██████  ██████  ██████"
echo "██████████  ██  ██  ████  ██  ████████████████  ████  ██  ██  ██████"
echo "██████████  ██  ██  ████  ██  ████  ████  ████  ████  ██  ██  ██████"
echo "██████████  ██  ██  ████  ██  ████  ████  ████  ████  ██  ██  ██████"
echo "██████████  ██████  ████  ██  ████  ████  ████  ████  ██████  ██████"
echo "██████████          ████      ████  ████  ████      ██        ██████"
echo "██████████████████  ██  ██  ██  ██  ██  ██  ██  ████████████████████"
echo "████████      ████        ██████  ██  ████    ██  ██    ████████████"
echo "██████████  ██  ████    ██████████████    ██  ██████████████  ██████"
echo "████████  ██  ████████████    ██  ██    ████████  ██    ██    ██████"
echo "████████  ████  ██████  ████  ██  ████████    ██  ████████    ██████"
echo "██████████    ██████████████████████  ████████  ████████████████████"
echo "████████  ████████  ██  ████████  ██  ██████  ██████  ██  ████████"
echo "██████████████    ████  ██████    ██  ████    ██████████████████████"
echo "██████████  ████████    ██    ██████  ██████  ██████  ██████████████"
echo "████████    ██  ██████████████  ████  ██  ██    ██  ██  ████  ██████"
echo "██████████  ██  ██    ██████████  ██████████████  ██  ██████  ██████"
echo "██████████████████  ██  ██  ██  ██  ██  ██  ██  ████████████████████"
echo "██████████  ██  ██  ████████████      ████  ████    ██    ██  ██████"
echo "██████████  ██  ██  ████  ████████████████  ██████████  ██  ██  ████"
echo "██████████  ██  ██  ████      ██  ████  ██  ████  ████    ██  ██████"
echo "██████████  ██████  ████  ████  ████  ████  ██  ██████  ██████  ████"
echo "██████████  ██████  ████  ██      ██      ██    ██████  ██████  ████"
echo "██████████          ████████  ██████  ████████  ████          ██████"
echo "████████████████████████████████████████████████████████████████████"
echo "████████████████████████████████████████████████████████████████████"
echo ""
show_output "Or copy-paste this URI: nostr+walletconnect://b22f..."
show_output "Waiting for Signer to connect (timeout in 120s)..."
sleep 2.5

show_output "✓ Connected!"
sleep 0.5
show_output "Disconnecting from bunker..."
show_output "Disconnected from bunker."
show_output "Successfully connected to bunker a8c7d3f2..."
show_output "Generated and stored nbunksec string."
show_output ""
sleep 1

# Project info
show_output "? Enter website or project name:"
type_input "My Decentralized Site"
show_output ""

show_output "? Enter website or project description:"
type_input "A demo site showcasing nsyte's decentralized publishing"
show_output ""

# Relays
show_output "? Enter nostr relay URLs (leave empty when done):"
show_output "? Enter relay URL: (wss://nostr.cercatrova.me) (wss://relay.primal.net) (wss://relay.wellorder.net) (wss://nos.lol) (wss://nostr-pub.wellorder.net) (wss://relay.damus.io) (wss://relay.nostr.band)"
type_input "wss://relay.damus.io"
show_output ""

show_output "? Enter relay URL:"
type_input "wss://nos.lol"
show_output ""

show_output "? Enter relay URL:"
type_input "wss://relay.nostr.band"
show_output ""

show_output "? Enter relay URL:"
type_input ""
show_output ""

# Blossom servers
show_output "? Enter blossom server URLs (leave empty when done):"
show_output "? Enter blossom server URL: (https://blossom.primal.net) (https://cdn.nostrcheck.me) (https://cdn.satellite.earth) (https://nostr.download)"
type_input "https://blossom.primal.net"
show_output ""

show_output "? Enter blossom server URL:"
type_input "https://cdn.satellite.earth"
show_output ""

show_output "? Enter blossom server URL:"
type_input ""
show_output ""

# Publishing options
show_output "? Publish profile information to nostr? (Y/n)"
type_input ""
show_output ""

show_output "? Publish relay list to nostr? (Y/n)"
type_input ""
show_output ""

show_output "? Publish blossom server list to nostr? (Y/n)"
type_input ""
show_output ""

# Success message
show_output "✅ Project initialized successfully with:"
show_output "- Authentication: bunker connection"
show_output "- Relays: 3"
show_output "- Blossom servers: 2"
show_output ""
show_output "Configuration saved to .nsite/config.json"
show_output ""
sleep 2

# Now show upload
type_out "nsyte upload ."
sleep 0.5

# Upload output with table format
show_output ""
show_output "┌─────────────────────────────────────────────────────────────────────────────┐"
show_output "│ Upload Configuration                                                        │"
show_output "├─────────────────────────────────────────────────────────────────────────────┤"
show_output "│ User               │ npub1p5rjvgr...92ue50sr                           │"
show_output "│ Relays             │ wss://relay.damus.io, wss://nos.lol, wss://relay.… │"
show_output "│ Servers            │ https://blossom.primal.net, https://cdn.satellite… │"
show_output "│ Force Upload       │ No                                                 │"
show_output "│ Purge Old Files    │ No                                                 │"
show_output "│ Concurrency        │ 5                                                  │"
show_output "│ 404 Fallback       │ None                                               │"
show_output "│ Publish            │                                                    │"
show_output "│  - Relay List      │ Yes                                                │"
show_output "│  - Server List     │ Yes                                                │"
show_output "│  - Profile         │ Yes                                                │"
show_output "└─────────────────────────────────────────────────────────────────────────────┘"
show_output ""

# Scanning
echo -n "Scanning files... "
sleep 0.8
echo "Done"

echo -n "Checking remote files... "
sleep 1.2
echo "Done"
echo ""

show_output "Found 2 files to process for upload."
show_output ""

# Upload progress
echo -n "Uploading files: ["
for i in {1..20}; do
    echo -n "█"
    sleep 0.08
done
echo "] 100% (2/2)"
echo ""

# Results
show_output "┌─────────────────────────────────────────────────────────────────────────────┐"
show_output "│ Blobs Upload Results (🌸 Blossom)                                          │"
show_output "├─────────────────────────────────────────────────────────────────────────────┤"
show_output "✓ All 2 files successfully uploaded"
show_output ""
show_output "┌─────────────────────────────────────────────────────────────────────────────┐"
show_output "│ Blossom Server Summary                                                      │"
show_output "├─────────────────────────────────────────────────────────────────────────────┤"
show_output "✓ https://blossom.primal.net        2/2 (100%)"
show_output "✓ https://cdn.satellite.earth       2/2 (100%)"
show_output ""
show_output "┌─────────────────────────────────────────────────────────────────────────────┐"
show_output "│ Nsite Events Publish Results (𓅦 nostr)                                    │"
show_output "├─────────────────────────────────────────────────────────────────────────────┤"
show_output "✓ All 2 file events successfully published to relays"
show_output ""
show_output "✅ Upload complete!"
show_output ""
sleep 2

# List files
type_out "nsyte ls"
sleep 0.5

show_output ""
show_output "Listing files for a8c7d3f2...56ba47e9 using relays: wss://relay.damus.io, wss://nos.lol"
show_output ""
show_output "Found 2 files:"
show_output "/index.html"
show_output "/style.css"
show_output ""
sleep 2

# Show success
show_output "🎉 Your site is now live on the decentralized web!"
show_output ""
sleep 2

# Show help menu
type_out "nsyte --help"
show_output ""
show_output "nsyte - Publish your site to nostr and blossom servers"
show_output ""
show_output "Usage: nsyte [command] [options]"
show_output ""
show_output "Commands:"
show_output "  init       Initialize a new project configuration"
show_output "  upload     Upload files to blossom servers"
show_output "  ls         List files from nostr relays"
show_output "  download   Download files from blossom servers"
show_output "  bunker     Connect to an nsec bunker"
show_output "  ci         Generate CI/CD-friendly bunker connection"
show_output ""
show_output "Options:"
show_output "  -h, --help     Display this help message"
show_output "  -v, --version  Display version information"
show_output ""
show_output "Examples:"
show_output "  nsyte init             # Set up a new project"
show_output "  nsyte upload .         # Upload current directory"
show_output "  nsyte ls               # List published files"
show_output "  nsyte bunker connect   # Connect to bunker"
show_output ""

# Wait 6 seconds before loop restart
sleep 6