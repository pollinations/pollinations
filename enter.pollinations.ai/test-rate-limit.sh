#!/bin/bash

# Test rate limiter with publishable key
# Should allow 9 requests per 90 seconds per IP

BASE_URL="http://localhost:3000/api/generate"

# You'll need to replace this with an actual publishable key (pk_...)
# For now, testing without auth (anonymous)
echo "🧪 Testing Rate Limiter (9 requests per 90 seconds)"
echo "===================================================="
echo ""

echo "Making 10 requests rapidly..."
echo ""

for i in {1..10}; do
  echo "Request $i:"
  response=$(curl -s -w "\nHTTP Status: %{http_code}\n" \
    "${BASE_URL}/text/say_hello_${i}" \
    -o /dev/null)
  echo "$response"
  echo ""
  
  # Small delay to avoid overwhelming the server
  sleep 0.5
done

echo "✅ Expected behavior:"
echo "  - Requests 1-9: HTTP 200 (success)"
echo "  - Request 10: HTTP 429 (rate limited)"
echo ""
echo "⏰ Wait 30 seconds and try again - should work!"
