#!/bin/bash
set -e

echo "🚀 Starting nsyte website development server..."

# Function to cleanup background processes
cleanup() {
    echo "🛑 Shutting down servers..."
    kill $VITEPRESS_PID $FILE_WATCHER_PID $HTTP_SERVER_PID 2>/dev/null || true
    exit 0
}

# Trap cleanup on script exit
trap cleanup EXIT INT TERM

# Build initial site
echo "📦 Building initial site..."
./scripts/build-site.sh

# Start VitePress serve for docs hot reloading in background
echo "📚 Starting VitePress server for docs..."
./scripts/serve-docs.sh --host 127.0.0.1 --port 8001 &
VITEPRESS_PID=$!

# Start simple HTTP server for the splash page using Deno
echo "🌐 Starting HTTP server for splash page..."
deno run --allow-net --allow-read https://deno.land/std@0.220.0/http/file_server.ts --port=8000 ./dist > /dev/null 2>&1 &
HTTP_SERVER_PID=$!

# File watcher for splash page and install script changes using fswatch (macOS) or inotify (Linux)
echo "👀 Starting file watcher for splash page and install script..."
if command -v fswatch >/dev/null 2>&1; then
    # macOS
    fswatch -o website/src/index.html website/src/install-redirect.html scripts/install.sh | while read f; do
        echo "🔄 Files changed, rebuilding..."
        cp website/src/index.html dist/
        cp website/src/install-redirect.html dist/install.html
        mkdir -p dist/get
        cp scripts/install.sh dist/get/install.sh
        cp scripts/install.sh dist/get/install.txt
        cp scripts/install.sh dist/install.txt
        cp scripts/install.sh dist/install.sh
        echo "✅ Files updated"
    done &
elif command -v inotifywait >/dev/null 2>&1; then
    # Linux
    while inotifywait -e modify website/src/index.html website/src/install-redirect.html scripts/install.sh; do
        echo "🔄 Files changed, rebuilding..."
        cp website/src/index.html dist/
        cp website/src/install-redirect.html dist/install.html
        mkdir -p dist/get
        cp scripts/install.sh dist/get/install.sh
        cp scripts/install.sh dist/get/install.txt
        cp scripts/install.sh dist/install.txt
        cp scripts/install.sh dist/install.sh
        echo "✅ Files updated"
    done &
else
    echo "⚠️  File watching not available (install fswatch on macOS or inotify-tools on Linux)"
    echo "   You'll need to manually run 'deno task site:build' after changes"
fi
FILE_WATCHER_PID=$!

echo ""
echo "🎉 Development servers running:"
echo "   📱 Splash page: http://localhost:8000"
echo "   📚 Documentation: http://localhost:8000/docs"
echo "   🔧 VitePress dev server: http://localhost:8001/docs/ (for docs-only editing)"
echo ""
echo "✨ Changes to website/src/index.html will auto-rebuild the splash page"
echo "✨ Changes to scripts/install.sh will auto-rebuild the install script"
echo "✨ Changes to docs/ will hot reload via VitePress"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for all background processes
wait
