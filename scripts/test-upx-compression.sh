#!/bin/bash

# Script to test UPX compression locally on macOS

echo "🔧 Testing UPX compression on nsyte binary"
echo ""

# Check if UPX is installed
if ! command -v upx &> /dev/null; then
    echo "❌ UPX is not installed. Install it with:"
    echo "   brew install upx"
    exit 1
fi

# Compile the binary if needed
if [ ! -f "dist/nsyte-macos" ]; then
    echo "📦 Compiling nsyte binary..."
    deno task compile:macos:production
fi

# Display original size
echo "📊 Original binary:"
ls -lh dist/nsyte-macos
ORIGINAL_SIZE=$(ls -l dist/nsyte-macos | awk '{print $5}')

# Create a copy for compression
echo ""
echo "🗜️  Creating compressed versions..."
cp dist/nsyte-macos dist/nsyte-macos-upx-default
cp dist/nsyte-macos dist/nsyte-macos-upx-best
cp dist/nsyte-macos dist/nsyte-macos-upx-best-lzma

# Test different compression levels
echo ""
echo "Testing default compression..."
upx dist/nsyte-macos-upx-default

echo ""
echo "Testing --best compression..."
upx --best dist/nsyte-macos-upx-best

echo ""
echo "Testing --best --lzma compression..."
upx --best --lzma dist/nsyte-macos-upx-best-lzma

# Display results
echo ""
echo "📊 Compression Results:"
echo "================================"
echo "Original:          $(ls -lh dist/nsyte-macos | awk '{print $5}')"
echo "Default:           $(ls -lh dist/nsyte-macos-upx-default | awk '{print $5}')"
echo "Best:              $(ls -lh dist/nsyte-macos-upx-best | awk '{print $5}')"
echo "Best + LZMA:       $(ls -lh dist/nsyte-macos-upx-best-lzma | awk '{print $5}')"
echo ""

# Calculate compression ratios
DEFAULT_SIZE=$(ls -l dist/nsyte-macos-upx-default | awk '{print $5}')
BEST_SIZE=$(ls -l dist/nsyte-macos-upx-best | awk '{print $5}')
LZMA_SIZE=$(ls -l dist/nsyte-macos-upx-best-lzma | awk '{print $5}')

echo "Compression Ratios:"
echo "Default:     $(echo "scale=1; 100 - ($DEFAULT_SIZE * 100 / $ORIGINAL_SIZE)" | bc)% reduction"
echo "Best:        $(echo "scale=1; 100 - ($BEST_SIZE * 100 / $ORIGINAL_SIZE)" | bc)% reduction"
echo "Best + LZMA: $(echo "scale=1; 100 - ($LZMA_SIZE * 100 / $ORIGINAL_SIZE)" | bc)% reduction"

# Test functionality
echo ""
echo "🧪 Testing compressed binaries..."
echo ""
echo "Testing default compressed:"
./dist/nsyte-macos-upx-default --version

echo ""
echo "Testing best compressed:"
./dist/nsyte-macos-upx-best --version

echo ""
echo "Testing best + LZMA compressed:"
./dist/nsyte-macos-upx-best-lzma --version

# Startup time comparison
echo ""
echo "⏱️  Startup time comparison:"
echo ""
echo "Original:"
time ./dist/nsyte-macos --version > /dev/null 2>&1

echo ""
echo "Best + LZMA compressed:"
time ./dist/nsyte-macos-upx-best-lzma --version > /dev/null 2>&1

echo ""
echo "✅ Test complete!"
echo ""
echo "Recommendation: The '--best --lzma' option provides the best compression"
echo "while maintaining functionality. Use this in the GitHub Actions workflow."