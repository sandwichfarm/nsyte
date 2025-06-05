#!/bin/bash
# Accurate nsyte CLI demo with proper colors and Cliffy UX features

# Clear screen and set up for asciinema
clear

# Show the actual ASCII header with proper ANSI color
printf "\033[33m"
cat << 'EOF'
                             dP            
                             88            
88d888b. .d8888b. dP    dP d8888P .d8888b. 
88'  `88 Y8ooooo. 88    88   88   88ooood8 
88    88       88 88.  .88   88   88.  ... 
dP    dP `88888P' `8888P88   dP   `88888P' 
                       .88                 
                   d8888P                  
EOF
printf "\033[0m\n\n"

# Helper functions
type_command() {
    printf "$ "
    for (( i=0; i<${#1}; i++ )); do
        printf "${1:$i:1}"
        sleep 0.05
    done
    printf "\n"
    sleep 0.8
}

type_input() {
    for (( i=0; i<${#1}; i++ )); do
        printf "${1:$i:1}"
        sleep 0.08
    done
    printf "\n"
    sleep 0.5
}

show_output() {
    printf "%s\n" "$1"
    sleep 0.2
}

# Start demo with init command
type_command "nsyte init"

show_output ""
show_output "$(printf '\033[36mNo existing project configuration found. Setting up a new one:\033[0m')"
show_output ""
sleep 0.7
show_output "$(printf '\033[36mWelcome to nsyte setup!\033[0m')"
show_output ""
sleep 2.0

# Key management selection (accurate to the Select.prompt)
show_output "? How would you like to manage your nostr key? (Use arrow keys)"
show_output "❯ Generate a new private key"
show_output "  Use an existing private key"
show_output "  Connect to an NSEC bunker"
sleep 1.8
show_output ""

# Move selection to bunker option
show_output "? How would you like to manage your nostr key?"
show_output "  Generate a new private key"
show_output "  Use an existing private key"
show_output "❯ Connect to an NSEC bunker"
sleep 1.0
show_output ""

# Bunker connection method
show_output "? How would you like to connect to the bunker? (Use arrow keys)"
show_output "❯ Scan QR Code (Nostr Connect)"
show_output "  Enter Bunker URL manually"
sleep 1.2
show_output ""

# Relay input with default (accurate to Input.prompt with default)
show_output "? Enter relays (comma-separated), or press Enter for default (wss://relay.nsec.app):"
type_input ""
show_output ""

# Connection process
show_output "$(printf '\033[36mInitiating Nostr Connect as '"'"'nsyte'"'"' on relays: wss://relay.nsec.app\033[0m')"
show_output "Please scan the QR code with your NIP-46 compatible signer (e.g., mobile wallet):"
show_output ""

# QR Code for https://www.youtube.com/watch?v=zL19uMsnpSU - visible for 35+ seconds
cat << 'EOF'
    ██████████████    ██████  ██        ██      ██████████████    
    ██          ██        ████  ██  ██      ██  ██          ██    
    ██  ██████  ██    ██████    ████      ████  ██  ██████  ██    
    ██  ██████  ██  ██  ████      ██  ████████  ██  ██████  ██    
    ██  ██████  ██  ██  ██  ████      ████████  ██  ██████  ██    
    ██          ██    ████      ██  ████    ██  ██          ██    
    ██████████████  ██  ██  ██  ██  ██  ██  ██  ██████████████    
                      ██    ██  ██        ██                      
    ████      ██████  ████  ████████████            ████          
          ████      ██  ██        ████    ██  ██  ████  ████      
    ██████  ██  ████████  ██████  ██  ██      ████                
    ██    ████      ██  ████    ██  ██    ██████  ██  ██          
          ██    ██  ██████          ██      ██  ████        ██    
      ██  ████        ████  ████    ██  ████    ██  ██    ████    
    ████████████████  ████    ██████    ██  ██  ████  ████        
    ████████████    ██      ██  ██████        ██  ████  ██  ██    
    ██  ██      ██  ██      ██████  ████          ██  ████        
    ██  ██    ██  ██    ██      ██████    ████████████  ██████    
    ████████  ████  ██████  ████████  ██  ████  ██    ██    ██    
    ██      ██    ████  ████        ██  ████  ██  ████            
    ██  ██  ██████  ██  ████    ██  ████    ██████████  ██████    
                    ██      ██    ████  ██  ██      ████          
    ██████████████  ██        ██  ██  ████████  ██  ██████        
    ██          ██  ██  ██  ██  ██████    ████      ██    ████    
    ██  ██████  ██    ██████████  ██      ██████████████  ██      
    ██  ██████  ██    ██        ████████████  ██  ██  ████  ██    
    ██  ██████  ██      ██████  ██████  ████    ████████████      
    ██          ██  ██  ████      ██    ████  ██████  ████  ██    
    ██████████████  ████  ████      ████████  ██  ████████        
EOF

show_output ""
show_output "Or copy-paste this URI: nostr+walletconnect://b22f..."
show_output "Waiting for Signer to connect (timeout in 120s)..."

# Keep QR code visible for 35+ seconds with countdown
for i in {35..1}; do
    printf "\rWaiting for connection... ${i}s    "
    sleep 1
done
printf "\r                                      \r"

# Connection success
show_output "$(printf '\033[32m✓ Connected!\033[0m')"
sleep 0.8
show_output "$(printf '\033[36mDisconnecting from bunker...\033[0m')"
show_output "$(printf '\033[32mDisconnected from bunker.\033[0m')"
show_output "$(printf '\033[32mSuccessfully connected to bunker a8c7d3f2...\033[0m')"
show_output "Generated and stored nbunksec string."
show_output "$(printf '\033[90mnbunksec1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqqqqqqqqqx9h7mz5\033[0m')"
show_output ""
sleep 3.0

# Project info (accurate to Input.prompt)
show_output "? Enter website or project name:"
type_input "My Decentralized Site"
show_output ""

show_output "? Enter website or project description:"
type_input "A demo site showcasing nsyte's decentralized publishing"
show_output ""

# Relay configuration with suggestions
show_output "$(printf '\033[36m\nEnter nostr relay URLs (leave empty when done):\033[0m')"
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

# Blossom server configuration with suggestions
show_output "$(printf '\033[36m\nEnter blossom server URLs (leave empty when done):\033[0m')"
show_output "? Enter blossom server URL: (https://cdn.hzrd149.com) (https://cdn.sovbit.host) (https://cdn.nostrcheck.me) (https://nostr.download)"
type_input "https://cdn.hzrd149.com"
show_output ""

show_output "? Enter blossom server URL:"
type_input "https://cdn.sovbit.host"
show_output ""

show_output "? Enter blossom server URL:"
type_input ""
show_output ""

# Confirm prompts with Y/n defaults (accurate to Confirm.prompt with default: true)
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
show_output "$(printf '\033[32m✅ Project initialized successfully with:\033[0m')"
show_output "- Authentication: bunker connection"
show_output "- Relays: 3"
show_output "- Blossom servers: 2"
show_output ""
show_output "Configuration saved to .nsite/config.json"
show_output ""
sleep 4.0

# Upload command
type_command "nsyte upload ."

show_output ""
# Upload configuration table
printf "\033[1m\033[36mUpload Configuration\033[0m\n"
show_output "User               : npub1p5rjvgr...92ue50sr"
show_output "Relays             : wss://relay.damus.io, wss://nos.lol, wss://relay.…"
show_output "Servers            : https://cdn.hzrd149.com, https://cdn.sovbit.host…"
show_output "Force Upload       : No"
show_output "Purge Old Files    : No"
show_output "Concurrency        : 5"
show_output "404 Fallback       : None"
show_output "Publish            :"
show_output "  - Relay List     : Yes"
show_output "  - Server List    : Yes"
show_output "  - Profile        : Yes"
show_output ""

# Scanning and checking
printf "Scanning files... "
sleep 0.9
printf "Done\n"

printf "Checking remote files... "
sleep 1.3
printf "Done\n\n"

show_output "Found 2 files to process for upload."
show_output ""

# Upload progress bar
printf "Uploading files: ["
for i in {1..20}; do
    printf "█"
    sleep 0.1
done
printf "] 100%% (2/2)\n\n"

# Upload results with proper emoji formatting
printf "\033[35m\033[1mBlobs Upload Results (🌸 Blossom)\033[0m\n"
show_output "$(printf '\033[32m✓ All 2 files successfully uploaded\033[0m')"
show_output ""

printf "\033[35m\033[1mBlossom Server Summary\033[0m\n"
show_output "$(printf '\033[32m✓\033[0m https://cdn.hzrd149.com           2/2 (100%%)')"
show_output "$(printf '\033[32m✓\033[0m https://cdn.sovbit.host           2/2 (100%%)')"
show_output ""

printf "\033[35m\033[1mNsite Events Publish Results (𓅦 nostr)\033[0m\n"
show_output "$(printf '\033[32m✓ All 2 file events successfully published to relays\033[0m')"
show_output ""
show_output "$(printf '\033[32m✅ Upload complete!\033[0m')"
show_output ""
sleep 3.5

# List files
type_command "nsyte ls"

show_output ""
show_output "Listing files for a8c7d3f2...56ba47e9 using relays: wss://relay.damus.io, wss://nos.lol"
show_output ""
show_output "Found 2 files:"
show_output "/index.html"
show_output "/style.css"
show_output ""
sleep 3.0

# Success message with nsite resolver URL
show_output "$(printf '\033[32m\033[1m🎉 Your site is now live on the decentralized web!\033[0m')"
show_output ""
show_output "$(printf '\033[36mYour site is accessible at:\033[0m')"
show_output "$(printf '\033[32mhttps://npub1nsyte9neefm3jle7dg5gw6mhchxyk75a6f5dng70l4l3a2mx0nashqv2jk.nsite.lol/\033[0m')"
show_output ""
sleep 4.0

# Help menu
type_command "nsyte --help"
show_output ""

printf "\033[36m\033[1mnsyte - Publish your site to nostr and blossom servers\033[0m\n\n"
show_output "Usage: nsyte [command] [options]"
show_output ""
printf "\033[33mCommands:\033[0m\n"
show_output "  init       Initialize a new project configuration"
show_output "  upload     Upload files to blossom servers"
show_output "  ls         List files from nostr relays"
show_output "  download   Download files from blossom servers"
show_output "  bunker     Connect to an nsec bunker"
show_output "  ci         Generate CI/CD-friendly bunker connection"
show_output ""
printf "\033[33mOptions:\033[0m\n"
show_output "  -h, --help     Display this help message"
show_output "  -v, --version  Display version information"
show_output ""
printf "\033[33mExamples:\033[0m\n"
show_output "  nsyte init             # Set up a new project"
show_output "  nsyte upload .         # Upload current directory"
show_output "  nsyte ls               # List published files"
show_output "  nsyte bunker connect   # Connect to bunker"
show_output ""

sleep 6