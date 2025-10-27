#!/bin/bash
# Test tier activation endpoint locally
# Make sure enter.pollinations.ai is running on localhost:3000

echo "Testing /api/tiers/activate endpoint..."
echo ""

# First, check if server is running
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "❌ Server not running on localhost:3000"
    echo "Run: npm run dev"
    exit 1
fi

echo "✅ Server is running"
echo ""

# You need to be logged in first - get session cookie
echo "📝 To test this endpoint, you need to:"
echo "1. Open http://localhost:3000 in browser"
echo "2. Log in with GitHub"
echo "3. Open browser DevTools > Application > Cookies"
echo "4. Copy the 'better-auth.session_token' cookie value"
echo "5. Run this script with the cookie:"
echo ""
echo "   ./test-tier-activate.sh <session-token>"
echo ""

if [ -z "$1" ]; then
    echo "❌ No session token provided"
    exit 1
fi

SESSION_TOKEN="$1"

echo "🧪 Testing tier activation with session token..."
echo ""

curl -v 'http://localhost:3000/api/tiers/activate' \
  -H 'Content-Type: application/json' \
  -H "Cookie: better-auth.session_token=$SESSION_TOKEN" \
  --data-raw '{"target_tier":"nectar"}' \
  2>&1 | grep -E "(< HTTP|error|message)"

echo ""
echo "✅ Test complete"
