#!/bin/bash
# =============================================================================
# Device Authorization Flow Test Script (RFC 8628)
# =============================================================================
# This script tests the OAuth 2.0 Device Authorization Grant flow.
# The access_token returned can be used as a Bearer token for all API calls.
#
# Usage:
#   ./test-device-flow.sh                    # Use default local URL
#   ./test-device-flow.sh https://enter.pollinations.ai/api  # Use production
# =============================================================================

API_URL="${1:-http://localhost:3001/api}"

echo "=============================================="
echo "Device Authorization Flow Test (RFC 8628)"
echo "=============================================="
echo "API URL: $API_URL"
echo ""

echo "1. Requesting device code..."
RESPONSE=$(curl -s -X POST "$API_URL/device/code")
echo "Response: $RESPONSE"

DEVICE_CODE=$(echo $RESPONSE | jq -r '.device_code')
USER_CODE=$(echo $RESPONSE | jq -r '.user_code')
VERIFICATION_URI=$(echo $RESPONSE | jq -r '.verification_uri')
TOKEN_TYPE=$(echo $RESPONSE | jq -r '.token_type // "Bearer"')

if [ "$DEVICE_CODE" == "null" ]; then
    echo "❌ Failed to get device code"
    exit 1
fi

echo ""
echo "Device Code: $DEVICE_CODE"
echo "User Code: $USER_CODE"
echo "Verification URI: $VERIFICATION_URI"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Please visit: $VERIFICATION_URI?code=$USER_CODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Waiting for authorization..."
sleep 2

echo "2. Polling for token..."
while true; do
    POLL_RESPONSE=$(curl -s -X POST "$API_URL/device/token" -H "Content-Type: application/json" -d "{\"device_code\": \"$DEVICE_CODE\"}")
    ERROR=$(echo $POLL_RESPONSE | jq -r '.error')
    
    if [ "$ERROR" == "authorization_pending" ]; then
        echo "⏳ Authorization pending... waiting 5s"
        sleep 5
    elif [ "$ERROR" == "null" ]; then
        ACCESS_TOKEN=$(echo $POLL_RESPONSE | jq -r '.access_token')
        TOKEN_TYPE=$(echo $POLL_RESPONSE | jq -r '.token_type')
        EXPIRES_IN=$(echo $POLL_RESPONSE | jq -r '.expires_in')
        echo "✅ Success!"
        echo "   Token Type: $TOKEN_TYPE"
        echo "   Expires In: $EXPIRES_IN seconds"
        echo "   Access Token: ${ACCESS_TOKEN:0:20}..."
        break
    else
        echo "❌ Error: $ERROR"
        exit 1
    fi
done

echo ""
echo "3. Testing Bearer token authentication (RFC 8628 compliant)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test the new RFC 8628 compliant endpoints using Bearer token
echo "3a. GET /api/device/session (Bearer token)"
SESSION_RESPONSE=$(curl -s "$API_URL/device/session" -H "Authorization: Bearer $ACCESS_TOKEN")
echo "Session Response: $SESSION_RESPONSE" | jq .

echo ""
echo "3b. GET /api/device/me (Bearer token)"
ME_RESPONSE=$(curl -s "$API_URL/device/me" -H "Authorization: Bearer $ACCESS_TOKEN")
echo "User Info: $ME_RESPONSE" | jq .

echo ""
echo "3c. GET /api/device/api-keys (Bearer token)"
API_KEYS_RESPONSE=$(curl -s "$API_URL/device/api-keys" -H "Authorization: Bearer $ACCESS_TOKEN")
echo "API Keys: $API_KEYS_RESPONSE" | jq .

echo ""
echo "=============================================="
echo "Test Complete!"
echo "=============================================="
echo ""
echo "Your Bearer token can be used with any endpoint:"
echo ""
echo "  curl -H 'Authorization: Bearer $ACCESS_TOKEN' \\"
echo "       $API_URL/device/me"
echo ""
