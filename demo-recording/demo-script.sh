#!/bin/bash
# Demo script for asciinema recording

# Clear the screen and show a welcome message
clear
echo "🌐 Welcome to nsyte - Decentralized Web Publishing"
echo "=================================================="
echo ""
sleep 2

# Show the current directory
echo "$ pwd"
pwd
echo ""
sleep 1

# Show the website files
echo "$ ls -la"
ls -la
echo ""
sleep 2

# Initialize nsyte
echo "$ nsyte init"
echo "Initializing nsyte project..."
echo "✅ Created nsyte.json configuration"
echo ""
sleep 2

# Show the configuration
echo "$ cat nsyte.json"
cat <<EOF
{
  "name": "my-decentralized-site",
  "description": "A demo site for nsyte",
  "include": ["**/*"],
  "exclude": ["node_modules/**", ".git/**"]
}
EOF
echo ""
sleep 2

# Connect to a bunker (simulated)
echo "$ nsyte bunker connect"
echo "How would you like to connect to the bunker?"
echo "  > Scan QR Code (Nostr Connect)"
echo "    Enter Bunker URL manually"
echo ""
echo "Connecting to bunker..."
sleep 1
echo "✅ Successfully connected to bunker"
echo "✅ Generated and stored nbunksec string"
echo ""
sleep 2

# Upload the site
echo "$ nsyte upload ."
echo "📦 Preparing files for upload..."
echo "  - index.html (1.2 KB)"
echo ""
echo "🚀 Uploading to decentralized infrastructure..."
echo "  ✓ Uploaded to wss://relay.damus.io"
echo "  ✓ Uploaded to wss://nos.lol"
echo "  ✓ Uploaded to https://blossom.primal.net"
echo ""
echo "✅ Site published successfully!"
echo ""
echo "🌐 Your site is now live at:"
echo "   https://njump.me/naddr1..."
echo ""
sleep 3

echo "🎉 Congratulations! Your site is now decentralized and censorship-resistant."
echo ""