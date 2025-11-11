#!/bin/bash

# Test script to verify GitHub email and API key name logging
# This script tests the local development server

BASE_URL="http://localhost:3000"

echo "🧪 Testing GitHub Email and API Key Name Logging"
echo "================================================"
echo ""

# Note: You need to be authenticated with a valid API key to test this
# Get your API key from the local dev server at http://localhost:3000

echo "📝 Instructions:"
echo "1. Go to http://localhost:3000 in your browser"
echo "2. Sign in with GitHub"
echo "3. Create an API key and copy it"
echo "4. Run this script with: ./test-logging.sh YOUR_API_KEY"
echo ""

if [ -z "$1" ]; then
    echo "❌ Error: No API key provided"
    echo "Usage: ./test-logging.sh YOUR_API_KEY"
    exit 1
fi

API_KEY="$1"

echo "🔑 Testing with API key: ${API_KEY:0:10}..."
echo ""

# Test 1: Simple text generation to trigger event logging
echo "Test 1: Text generation (triggers event logging)"
echo "------------------------------------------------"
curl -s "$BASE_URL/api/generate/text/test-logging-feature" \
  -H "Authorization: Bearer $API_KEY" \
  -w "\nHTTP Status: %{http_code}\n" \
  | head -20

echo ""
echo ""

# Test 2: Image generation to trigger event logging
echo "Test 2: Image generation (triggers event logging)"
echo "------------------------------------------------"
curl -s "$BASE_URL/api/generate/image/test-logging?model=flux&width=256&height=256" \
  -H "Authorization: Bearer $API_KEY" \
  -w "\nHTTP Status: %{http_code}\n" \
  -o /dev/null

echo ""
echo ""

echo "✅ Tests completed!"
echo ""
echo "📊 To verify the logging:"
echo "1. Check the terminal where 'npm run dev' is running"
echo "2. Look for log entries containing:"
echo "   - userGithubEmail: your-email@example.com"
echo "   - apiKeyName: your-api-key-name"
echo ""
echo "3. Or query the local D1 database:"
echo "   wrangler d1 execute DB --local --command=\"SELECT userGithubEmail, apiKeyName, userGithubName FROM event ORDER BY startTime DESC LIMIT 5\""
