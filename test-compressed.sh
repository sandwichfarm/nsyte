#!/bin/bash

# Test script for gz/brotli support

echo "Testing compressed file serving..."

# Create a temporary directory for test files
TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

# Create test HTML file
echo '<!DOCTYPE html><html><body><h1>Test Page</h1><p>This is a test page.</p></body></html>' > "$TEST_DIR/index.html"

# Create compressed versions
gzip -k "$TEST_DIR/index.html"
if command -v brotli >/dev/null 2>&1; then
    brotli "$TEST_DIR/index.html" -o "$TEST_DIR/index.html.br"
fi

echo "Created test files:"
ls -la "$TEST_DIR"

echo ""
echo "To test:"
echo "1. Deploy these files to an nsite"
echo "2. Run: ./dist/nsyte run"
echo "3. Check browser developer tools network tab for Content-Encoding headers"
echo "4. Verify that .gz or .br versions are served when available"

echo ""
echo "Test files location: $TEST_DIR"