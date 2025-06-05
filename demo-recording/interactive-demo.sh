#!/bin/bash
# Interactive demo script for asciinema recording
# This simulates user interaction with nsyte

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
    sleep 0.3
}

# Start the demo
clear
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              🌐 nsyte - Decentralized Web Publishing           ║"
echo "║                                                                ║"
echo "║  Deploy your site across decentralized infrastructure.         ║"
echo "║  No gatekeepers, no censorship, no single points of failure.  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo
sleep 3

# Show we're in a project directory
type_out "pwd"
show_output "/Users/demo/my-website"
echo
sleep 1

# Show the website files
type_out "ls -la"
show_output "total 16"
show_output "drwxr-xr-x  4 user  staff   128 Jan  6 10:00 ."
show_output "drwxr-xr-x  8 user  staff   256 Jan  6 09:00 .."
show_output "-rw-r--r--  1 user  staff  1234 Jan  6 10:00 index.html"
show_output "-rw-r--r--  1 user  staff   856 Jan  6 10:00 style.css"
echo
sleep 2

# Initialize nsyte project
type_out "nsyte init"
sleep 0.5
show_output "🚀 Initializing nsyte project..."
sleep 0.5
show_output ""
show_output "Project name: my-decentralized-site"
show_output "Description: A demo site showing nsyte capabilities"
show_output ""
show_output "✅ Created nsyte.json configuration file"
show_output "✅ Project initialized successfully!"
echo
sleep 2

# Show the generated config
type_out "cat nsyte.json"
sleep 0.5
cat <<'EOF'
{
  "name": "my-decentralized-site",
  "description": "A demo site showing nsyte capabilities",
  "include": ["**/*"],
  "exclude": ["node_modules/**", ".git/**", "*.log"],
  "relays": [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band"
  ]
}
EOF
echo
sleep 3

# Connect to a bunker
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
# Simulate QR code display
echo "    █▀▀▀▀▀█ ▄▀█▄ █  █▀▀▀▀▀█"
echo "    █ ███ █ ▀▄▀  ▀  █ ███ █"
echo "    █ ▀▀▀ █ █▄ ▄██  █ ▀▀▀ █"
echo "    ▀▀▀▀▀▀▀ █ ▀ █   ▀▀▀▀▀▀▀"
echo "    ▀█▄██▀▀▄▀█ ▄▀█▄ ▀██▄▀▀█"
echo "    █ ▄▀█▀ ▄ ▀▄▀  ▀ ▄▀█▀ ▄█"
echo "    ▀   ▀ ▀ █▄ ▄██  ▀   ▀ ▀"
echo "    █▀▀▀▀▀█ ▄▀█▄ █  █▀▀▀▀▀█"
echo "    █ ███ █ ▀▄▀  ▀  █ ███ █"
echo "    █ ▀▀▀ █ █▄ ▄██  █ ▀▀▀ █"
echo "    ▀▀▀▀▀▀▀ ▀▀▀▀▀▀  ▀▀▀▀▀▀▀"
echo
echo "    Scan with Amber, nos2x, or other NIP-46 wallet"
echo
sleep 2
show_output ""
show_output "⏳ Waiting for approval from wallet..."
sleep 2
show_output "✅ Connection approved!"
show_output ""
show_output "✅ Successfully connected to bunker"
show_output "✅ Your signing keys are secure in your wallet"
echo
sleep 2

# Upload the site
type_out "nsyte upload ."
sleep 0.5
show_output "📦 Analyzing project files..."
sleep 0.5
show_output "  Found 2 files to upload:"
show_output "  - index.html (1.2 KB)"
show_output "  - style.css (856 B)"
show_output "  Total size: 2.1 KB"
echo
sleep 1
show_output "🚀 Uploading to decentralized network..."
echo
sleep 0.5
show_output "  ⬆️  Uploading to wss://relay.damus.io... ✓"
sleep 0.3
show_output "  ⬆️  Uploading to wss://nos.lol... ✓"
sleep 0.3
show_output "  ⬆️  Uploading to wss://relay.nostr.band... ✓"
sleep 0.3
show_output "  ⬆️  Uploading to Blossom CDN... ✓"
echo
sleep 1
show_output "✅ Upload complete! Your site is now live."
echo
show_output "🌐 Access your site at:"
show_output "   https://njump.me/naddr1qvzqqqr4gupzqmjxss3dld622uu8q25gywum9qtnnpgkhg"
show_output ""
show_output "📱 Share your site:"
show_output "   nostr:naddr1qvzqqqr4gupzqmjxss3dld622uu8q25gywum9qtnnpgkhg"
echo
sleep 2

# Show some stats
type_out "nsyte status"
sleep 0.5
show_output "📊 Deployment Status:"
show_output ""
show_output "  Project: my-decentralized-site"
show_output "  Files: 2"
show_output "  Total size: 2.1 KB"
show_output "  Relays: 3/3 confirmed"
show_output "  Blossom CDN: Active"
show_output "  Last deployed: Just now"
echo
sleep 2

echo
echo "🎉 Your site is now decentralized and censorship-resistant!"
echo "   No single entity can take it down."
echo
sleep 2

# End message
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     🚀 Get started with nsyte                  ║"
echo "║                                                                ║"
echo "║  Install: curl -fsSL https://nsyte.run/get/install.sh | bash  ║"
echo "║  Docs: https://docs.nsyte.run                                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo