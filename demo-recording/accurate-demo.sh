#!/bin/bash
# Accurate nsyte demo script based on actual command outputs

# Function to simulate typing
type_out() {
    echo -n "$ "
    for (( i=0; i<${#1}; i++ )); do
        echo -n "${1:$i:1}"
        sleep 0.05
    done
    echo
    sleep 0.5
}

# Function to show output with a slight delay
show_output() {
    echo "$1"
    sleep 0.2
}

# Start the demo
clear

# Show ASCII art header (nsyte style)
echo -e "\033[36m"
cat << 'EOF'
                     __       
   ____  _______  __/ /____   
  / __ \/ ___/ / / / __/ _ \  
 / / / (__  ) /_/ / /_/  __/  
/_/ /_/____/\__, /\__/\___/   
           /____/             
EOF
echo -e "\033[0m"
sleep 2

# Initialize project
type_out "nsyte init"
sleep 0.5
show_output ""
show_output "✅ Project initialized successfully with:"
show_output "- Authentication: private key"
show_output "- Relays: 3"
show_output "- Blossom servers: 2"
show_output ""
show_output "Configuration saved to .nsite/config.json"
echo
sleep 2

# Show project structure
type_out "ls -la"
sleep 0.5
show_output "total 24"
show_output "drwxr-xr-x   5 user  staff   160 Jan  6 10:00 ."
show_output "drwxr-xr-x  10 user  staff   320 Jan  6 09:00 .."
show_output "drwxr-xr-x   3 user  staff    96 Jan  6 10:00 .nsite"
show_output "-rw-r--r--   1 user  staff  1234 Jan  6 10:00 index.html"
show_output "-rw-r--r--   1 user  staff   856 Jan  6 10:00 style.css"
echo
sleep 2

# Connect to bunker
type_out "nsyte bunker connect"
sleep 0.5
show_output "How would you like to connect to the bunker?"
show_output ""
show_output "  > Scan QR Code (Nostr Connect)"
show_output "    Enter Bunker URL manually"
show_output ""
sleep 1
show_output "Displaying QR code for mobile wallet connection..."
echo
# Simple QR representation
echo "    ▄▄▄▄▄▄▄ ▄ ▄▄ ▄▄▄▄▄▄▄"
echo "    █ ▄▄▄ █ ██ ▄ █ ▄▄▄ █"
echo "    █ ███ █ ▄▄▀█ █ ███ █"
echo "    █▄▄▄▄▄█ █ ▀ █ █▄▄▄▄▄█"
echo "    ▄▄ ▄  ▄▄▀██▀▀ ▄▄▄ ▄▄"
echo "    █▄██▀▀▄▄▄▄██▄▄▀█▄▄█ "
echo "    ▄ ▄▄▄▄▄ █▄█▀ ▄  ▄ ▄ "
echo "    █ ▄▄▄ █  ▄▄█▀██▄ ▄  "
echo "    █ ███ █ ▄ ▄ ▄█▄█ ██ "
echo "    █▄▄▄▄▄█ ███▀▄▀█ ▄█  "
echo
sleep 2
show_output ""
show_output "⏳ Waiting for approval from wallet..."
sleep 2
show_output "✅ Connection approved!"
show_output ""
show_output "Successfully connected to bunker 6f74ffcf..."
show_output "Nbunk string generated and stored."
show_output ""
show_output "Your nbunksec string (keep this secret!):"
show_output "\033[1mnbunksec1qgswxp3tqxnc4zqak5je5xg88g0vsj7elur7y6p\033[0m"
echo
sleep 3

# Upload the site
type_out "nsyte upload ."
sleep 0.5
show_output ""
show_output "User: npub1dxhfw2n8..xrszgkek7"
show_output "Relays: wss://relay.damus.io, wss://nos.lol, wss://relay.nostr.band"
show_output "Servers: https://blossom.primal.net, https://blossom.satellite.earth"
echo
sleep 1
show_output "Found 2 files to process for upload."
show_output "Uploading 2 files..."
echo
# Progress bar simulation
echo -n "["
for i in {1..20}; do
    echo -n "="
    sleep 0.1
done
echo "] 100%"
echo
sleep 0.5
show_output "Upload complete!"
echo
show_output "Results:"
show_output "✅ https://blossom.primal.net: 2 successful, 0 failed"
show_output "✅ https://blossom.satellite.earth: 2 successful, 0 failed"
echo
sleep 2

# List files
type_out "nsyte ls"
sleep 0.5
show_output ""
show_output "Listing files for 6f74ffcf..b3a41ead using relays: wss://relay.damus.io, wss://nos.lol"
show_output ""
show_output "Found 2 files:"
show_output "/index.html"
show_output "/style.css"
echo
sleep 2

# Show final message
echo
show_output "🎉 Your site is now live on the decentralized web!"
show_output ""
show_output "Access your site through any nostr web viewer that supports NIP-96"
show_output "Your content is distributed across multiple relays and servers"
echo
sleep 2