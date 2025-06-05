#!/bin/bash
# i18n-based nsyte demo script using actual console messages

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
I18N_DIR="$SCRIPT_DIR/i18n"

# Load JSON data (requires jq)
if ! command -v jq &> /dev/null; then
    echo "jq is required for this demo script"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

# Function to get message from i18n
get_message() {
    local key="$1"
    jq -r ".${key}" "$I18N_DIR/messages.json" 2>/dev/null || echo "Message not found: $key"
}

# Function to get color code
get_color() {
    local color="$1"
    jq -r ".colors.${color}" "$I18N_DIR/colors.json" 2>/dev/null || echo ""
}

# Function to apply style to text
apply_style() {
    local text="$1"
    local style_key="$2"
    
    # Get styles for this message
    local styles
    styles=$(jq -r ".message_styles[\"${style_key}\"] // [] | .[]" "$I18N_DIR/colors.json" 2>/dev/null)
    
    local styled_text="$text"
    local reset_code
    reset_code=$(get_color "reset")
    
    # Apply each style
    while IFS= read -r style; do
        if [[ -n "$style" ]]; then
            local color_code
            color_code=$(get_color "$style")
            styled_text="${color_code}${styled_text}"
        fi
    done <<< "$styles"
    
    # Add reset if we applied any styles
    if [[ "$styled_text" != "$text" ]]; then
        styled_text="${styled_text}${reset_code}"
    fi
    
    echo "$styled_text"
}

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

# Function to show styled output
show_output() {
    local text="$1"
    local style_key="$2"
    
    if [[ -n "$style_key" ]]; then
        text=$(apply_style "$text" "$style_key")
    fi
    
    echo "$text"
    sleep 0.15
}

# Function to show array messages
show_array() {
    local base_key="$1"
    local style_key="$2"
    local index=0
    
    while true; do
        local message
        message=$(jq -r ".${base_key}[${index}] // empty" "$I18N_DIR/messages.json" 2>/dev/null)
        if [[ -z "$message" ]]; then
            break
        fi
        
        show_output "$message" "$style_key"
        ((index++))
    done
}

# Function to create table border
create_table_border() {
    local char="$1"
    local length="$2"
    printf "%.0s${char}" $(seq 1 $length)
    echo
}

# Function to show upload configuration table
show_config_table() {
    local cyan=$(get_color "cyan")
    local reset=$(get_color "reset")
    
    echo "${cyan}┌─────────────────────────────────────────────────────────────────────────────┐${reset}"
    echo "${cyan}│ Upload Configuration                                                        │${reset}"
    echo "${cyan}├─────────────────────────────────────────────────────────────────────────────┤${reset}"
    echo "${cyan}│ User               │ $(get_message 'demo.upload.config_table.user')                           │${reset}"
    echo "${cyan}│ Relays             │ $(get_message 'demo.upload.config_table.relays') │${reset}"
    echo "${cyan}│ Servers            │ $(get_message 'demo.upload.config_table.servers') │${reset}"
    echo "${cyan}│ Force Upload       │ $(get_message 'demo.upload.config_table.force')                                                 │${reset}"
    echo "${cyan}│ Purge Old Files    │ $(get_message 'demo.upload.config_table.purge')                                                 │${reset}"
    echo "${cyan}│ Concurrency        │ $(get_message 'demo.upload.config_table.concurrency')                                                  │${reset}"
    echo "${cyan}│ 404 Fallback       │ $(get_message 'demo.upload.config_table.fallback')                                               │${reset}"
    echo "${cyan}│ Publish            │                                                    │${reset}"
    echo "${cyan}│  - Relay List      │ $(get_message 'demo.upload.config_table.publish_relays')                                                │${reset}"
    echo "${cyan}│  - Server List     │ $(get_message 'demo.upload.config_table.publish_servers')                                                │${reset}"
    echo "${cyan}│  - Profile         │ $(get_message 'demo.upload.config_table.publish_profile')                                                │${reset}"
    echo "${cyan}└─────────────────────────────────────────────────────────────────────────────┘${reset}"
}

# Function to show proper QR code
show_qr_code() {
    # Actual QR code for https://www.youtube.com/watch?v=zL19uMsnpSU
    echo "    ██████████████    ██████  ██        ██      ██████████████    "
    echo "    ██          ██        ████  ██  ██      ██  ██          ██    "
    echo "    ██  ██████  ██    ██████    ████      ████  ██  ██████  ██    "
    echo "    ██  ██████  ██  ██  ████      ██  ████████  ██  ██████  ██    "
    echo "    ██  ██████  ██  ██  ██  ████      ████████  ██  ██████  ██    "
    echo "    ██          ██    ████      ██  ████    ██  ██          ██    "
    echo "    ██████████████  ██  ██  ██  ██  ██  ██  ██  ██████████████    "
    echo "                      ██    ██  ██        ██                      "
    echo "    ████      ██████  ████  ████████████            ████          "
    echo "          ████      ██  ██        ████    ██  ██  ████  ████      "
    echo "    ██████  ██  ████████  ██████  ██  ██      ████                "
    echo "    ██    ████      ██  ████    ██  ██    ██████  ██  ██          "
    echo "          ██    ██  ██████          ██      ██  ████        ██    "
    echo "      ██  ████        ████  ████    ██  ████    ██  ██    ████    "
    echo "    ████████████████  ████    ██████    ██  ██  ████  ████        "
    echo "    ████████████    ██      ██  ██████        ██  ████  ██  ██    "
    echo "    ██  ██      ██  ██      ██████  ████          ██  ████        "
    echo "    ██  ██    ██  ██    ██      ██████    ████████████  ██████    "
    echo "    ████████  ████  ██████  ████████  ██  ████  ██    ██    ██    "
    echo "    ██      ██    ████  ████        ██  ████  ██  ████            "
    echo "    ██  ██  ██████  ██  ████    ██  ████    ██████████  ██████    "
    echo "                    ██      ██    ████  ██  ██      ████          "
    echo "    ██████████████  ██        ██  ██  ████████  ██  ██████        "
    echo "    ██          ██  ██  ██  ██  ██████    ████      ██    ████    "
    echo "    ██  ██████  ██    ██████████  ██      ██████████████  ██      "
    echo "    ██  ██████  ██    ██        ████████████  ██  ██  ████  ██    "
    echo "    ██  ██████  ██      ██████  ██████  ████    ████████████      "
    echo "    ██          ██  ██  ████      ██    ████  ██████  ████  ██    "
    echo "    ██████████████  ████  ████      ████████  ██  ████████        "
}

# Start the demo
clear

# Show header
show_output "$(get_message 'demo.init.header')" "demo.init.header"
echo

# Initial command
type_out "nsyte init"
sleep 0.5

show_output ""
show_output "$(get_message 'demo.init.no_config')" "demo.init.no_config"
show_output ""
sleep 0.5
show_output "$(get_message 'demo.init.welcome')" "demo.init.welcome"
show_output ""
sleep 0.5

# Key management prompt
show_output "$(get_message 'demo.init.key_management.prompt')"
show_array "demo.init.key_management.options"
sleep 1.5
show_output ""

# Select bunker option
show_output "$(get_message 'demo.init.key_management.prompt')"
show_array "demo.init.key_management.selected"
sleep 0.8
show_output ""

# Bunker connection method
show_output "$(get_message 'demo.init.bunker_connection.prompt')"
show_array "demo.init.bunker_connection.options"
sleep 1
show_output ""

# Relay prompt
show_output "$(get_message 'demo.init.relay_prompt')"
type_input ""
show_output ""

# Show connection process
show_output "$(get_message 'demo.init.connecting')"
show_output "$(get_message 'demo.init.qr_instruction')"
show_output ""

# Show QR code
show_qr_code
echo
show_output "$(get_message 'demo.init.qr_uri')"
show_output "$(get_message 'demo.init.waiting')"
sleep 2.5

show_output "$(get_message 'demo.init.connected')" "demo.init.connected"
sleep 0.5
show_output "$(get_message 'demo.init.disconnecting')"
show_output "$(get_message 'demo.init.disconnected')"
show_output "$(get_message 'demo.init.success')" "demo.init.success"
show_output "$(get_message 'demo.init.stored')"
show_output ""
sleep 1

# Project info
show_output "$(get_message 'demo.init.project_name')"
type_input "My Decentralized Site"
show_output ""

show_output "$(get_message 'demo.init.project_description')"
type_input "A demo site showcasing nsyte's decentralized publishing"
show_output ""

# Relays
show_output "$(get_message 'demo.init.relay_setup.prompt')"
show_output "$(get_message 'demo.init.relay_setup.url_prompt') $(get_message 'demo.init.relay_setup.suggestions')"
type_input "wss://relay.damus.io"
show_output ""

show_output "$(get_message 'demo.init.relay_setup.url_prompt')"
type_input "wss://nos.lol"
show_output ""

show_output "$(get_message 'demo.init.relay_setup.url_prompt')"
type_input "wss://relay.nostr.band"
show_output ""

show_output "$(get_message 'demo.init.relay_setup.url_prompt')"
type_input ""
show_output ""

# Blossom servers
show_output "$(get_message 'demo.init.blossom_setup.prompt')"
show_output "$(get_message 'demo.init.blossom_setup.url_prompt') $(get_message 'demo.init.blossom_setup.suggestions')"
type_input "https://blossom.primal.net"
show_output ""

show_output "$(get_message 'demo.init.blossom_setup.url_prompt')"
type_input "https://cdn.satellite.earth"
show_output ""

show_output "$(get_message 'demo.init.blossom_setup.url_prompt')"
type_input ""
show_output ""

# Publishing options
show_output "$(get_message 'demo.init.publish_options.profile')"
type_input ""
show_output ""

show_output "$(get_message 'demo.init.publish_options.relays')"
type_input ""
show_output ""

show_output "$(get_message 'demo.init.publish_options.servers')"
type_input ""
show_output ""

# Success message
show_output "$(get_message 'demo.init.complete.success')" "demo.init.complete.success"
show_output "$(get_message 'demo.init.complete.auth')"
show_output "$(get_message 'demo.init.complete.relays')"
show_output "$(get_message 'demo.init.complete.servers')"
show_output ""
show_output "$(get_message 'demo.init.complete.config_saved')"
show_output ""
sleep 2

# Now show upload
type_out "nsyte upload ."
sleep 0.5

# Upload output with proper formatting
show_output ""
show_config_table
show_output ""

# Scanning
echo -n "$(get_message 'demo.upload.scanning')"
sleep 0.8
echo "$(get_message 'demo.upload.done')"

echo -n "$(get_message 'demo.upload.checking')"
sleep 1.2
echo "$(get_message 'demo.upload.done')"
echo ""

show_output "$(get_message 'demo.upload.found_files')"
show_output ""

# Upload progress
echo -n "$(get_message 'demo.upload.uploading')"
for i in {1..20}; do
    echo -n "$(get_message 'demo.upload.progress')"
    sleep 0.08
done
echo "$(get_message 'demo.upload.complete_progress')"
echo ""

# Results with proper sections
cyan=$(get_color "cyan")
green=$(get_color "green")
reset=$(get_color "reset")

echo "${cyan}┌─────────────────────────────────────────────────────────────────────────────┐${reset}"
echo "${cyan}│ $(get_message 'demo.upload.results.blobs_header')                                          │${reset}"
echo "${cyan}├─────────────────────────────────────────────────────────────────────────────┤${reset}"
show_output "$(get_message 'demo.upload.results.all_success')" "demo.upload.results.all_success"
show_output ""

echo "${cyan}┌─────────────────────────────────────────────────────────────────────────────┐${reset}"
echo "${cyan}│ $(get_message 'demo.upload.results.server_header')                                                      │${reset}"
echo "${cyan}├─────────────────────────────────────────────────────────────────────────────┤${reset}"
show_array "demo.upload.results.server_results"
show_output ""

echo "${cyan}┌─────────────────────────────────────────────────────────────────────────────┐${reset}"
echo "${cyan}│ $(get_message 'demo.upload.results.events_header')                                    │${reset}"
echo "${cyan}├─────────────────────────────────────────────────────────────────────────────┤${reset}"
show_output "$(get_message 'demo.upload.results.events_success')" "demo.upload.results.events_success"
show_output ""
show_output "$(get_message 'demo.upload.results.upload_complete')" "demo.upload.results.upload_complete"
show_output ""
sleep 2

# List files
type_out "nsyte ls"
sleep 0.5

show_output ""
show_output "$(get_message 'demo.ls.listing')"
show_output ""
show_output "$(get_message 'demo.ls.found')"
show_array "demo.ls.files"
show_output ""
sleep 2

# Show success
show_output "$(get_message 'demo.success')" "demo.success"
show_output ""
sleep 2

# Show help menu
type_out "nsyte --help"
show_output ""
show_output "$(get_message 'demo.help.title')" "demo.help.title"
show_output ""
show_output "$(get_message 'demo.help.usage')"
show_output ""
show_output "$(get_message 'demo.help.commands_header')" "demo.help.commands_header"
show_array "demo.help.commands"
show_output ""
show_output "$(get_message 'demo.help.options_header')" "demo.help.options_header"
show_array "demo.help.options"
show_output ""
show_output "$(get_message 'demo.help.examples_header')" "demo.help.examples_header"
show_array "demo.help.examples"
show_output ""

# Wait 6 seconds before loop restart
sleep 6