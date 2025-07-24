#!/bin/bash

# Test script for gz/brotli support with assertions

set -e  # Exit on error

echo "Testing compressed file serving..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Create a temporary directory for test files
TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

# Create test HTML file
TEST_CONTENT='<!DOCTYPE html><html><body><h1>Test Page</h1><p>This is a test page.</p></body></html>'
echo "$TEST_CONTENT" > "$TEST_DIR/index.html"

# Create compressed versions
gzip -k "$TEST_DIR/index.html"
if command -v brotli >/dev/null 2>&1; then
    brotli "$TEST_DIR/index.html" -o "$TEST_DIR/index.html.br"
fi

echo "Created test files:"
ls -la "$TEST_DIR"

# Function to test server response
test_response() {
    local url=$1
    local accept_encoding=$2
    local expected_encoding=$3
    local test_name=$4
    
    echo -n "Testing $test_name... "
    
    # Make request with curl
    response=$(curl -s -D - -H "Accept-Encoding: $accept_encoding" "$url" -o /dev/null)
    
    # Check Content-Encoding header
    if echo "$response" | grep -qi "Content-Encoding: $expected_encoding"; then
        echo -e "${GREEN}PASS${NC}"
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        echo "Expected Content-Encoding: $expected_encoding"
        echo "Response headers:"
        echo "$response" | head -20
        return 1
    fi
}

# Function to run tests against a local server
run_tests() {
    local port=$1
    local base_url="http://localhost:$port"
    
    echo ""
    echo "Running tests against $base_url"
    echo "================================"
    
    # Test 1: Request with br support should get brotli
    if [ -f "$TEST_DIR/index.html.br" ]; then
        test_response "$base_url/index.html" "br, gzip, deflate" "br" "Brotli compression"
    fi
    
    # Test 2: Request with only gzip support should get gzip
    test_response "$base_url/index.html" "gzip, deflate" "gzip" "Gzip compression"
    
    # Test 3: Request with no compression support should get uncompressed
    test_response "$base_url/index.html" "" "" "No compression"
    
    # Test 4: Check that the content is correct
    echo -n "Testing content integrity... "
    content=$(curl -s -H "Accept-Encoding: gzip" "$base_url/index.html" | gunzip 2>/dev/null || curl -s "$base_url/index.html")
    if echo "$content" | grep -q "Test Page"; then
        echo -e "${GREEN}PASS${NC}"
    else
        echo -e "${RED}FAIL${NC}"
        echo "Content doesn't match expected"
    fi
}

echo ""
echo "To test:"
echo "1. Deploy these files to an nsite: nsyte deploy $TEST_DIR"
echo "2. Run the server: nsyte run -p 8080"
echo "3. In another terminal, run: $0 --run-tests 8080"
echo ""
echo "Test files location: $TEST_DIR"

# Check if we should run the tests
if [ "$1" == "--run-tests" ] && [ -n "$2" ]; then
    run_tests "$2"
fi

# Cleanup function
cleanup() {
    if [ -d "$TEST_DIR" ]; then
        rm -rf "$TEST_DIR"
        echo "Cleaned up test directory"
    fi
}

# Register cleanup on exit if --cleanup flag is passed
if [ "$1" == "--cleanup" ]; then
    cleanup
fi