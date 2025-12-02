#!/usr/bin/env bash
# Test script to verify server works

set -e

echo "🧪 Testing DFlow MCP Server..."

# Test compilation
echo "📝 Checking TypeScript compilation..."
bun run tsc --noEmit

# Test server startup and tool listing
echo "🚀 Testing server startup..."

# Send request to server and capture response
response=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | timeout 10s bun run ./src/index.ts 2>/dev/null || echo "")

if [ -z "$response" ]; then
    echo "❌ Server failed to respond"
    exit 1
fi

# Check if response contains expected fields
if echo "$response" | grep -q '"tools"'; then
    echo "✅ Server responded with valid JSON"
    
    # Count tools using simple string parsing
    tool_count=$(echo "$response" | grep -o '"name":"' | wc -l || echo "0")
    echo "📋 Server has $tool_count tools"
    
    if [ "$tool_count" -gt 0 ]; then
        echo "✅ Tools loaded successfully"
        
        # Show first few tool names
        echo "📝 Sample tools:"
        echo "$response" | grep -o '"name":"[^"]*"' | head -5 | cut -d'"' -f4 | tr '\n' ' '
        echo ""
    else
        echo "❌ No tools found"
        exit 1
    fi
else
    echo "❌ Server response missing tools field"
    echo "Response preview:"
    echo "$response" | head -3
    exit 1
fi

echo ""
echo "🎉 All tests passed!"