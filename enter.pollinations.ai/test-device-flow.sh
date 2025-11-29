#!/bin/bash
# =============================================================================
# Device Authorization Flow Test Script (RFC 8628)
# Uses better-auth's official deviceAuthorization plugin
# =============================================================================
# 
# Flow:
# 1. POST /api/auth/device/code - Get device_code and user_code
# 2. User visits verification URL and approves in browser
# 3. POST /api/auth/device/token - Poll for session token
# 4. POST /api/device/exchange-for-api-key - Exchange session for API key
# =============================================================================

API_URL="${1:-http://localhost:3001/api}"
CLIENT_ID="${2:-pollinations-cli}"

echo "=============================================="
echo "Device Authorization Flow Test (RFC 8628)"
echo "=============================================="
echo "API URL: $API_URL"
echo ""

echo "1. Requesting device code..."
RESPONSE=$(curl -s -X POST "$API_URL/auth/device/code" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\": \"$CLIENT_ID\"}")
echo "Response: $RESPONSE"

DEVICE_CODE=$(echo $RESPONSE | jq -r '.device_code // .deviceCode')
USER_CODE=$(echo $RESPONSE | jq -r '.user_code // .userCode')
VERIFICATION_URI=$(echo $RESPONSE | jq -r '.verification_uri // .verificationUri')
INTERVAL=$(echo $RESPONSE | jq -r '.interval // 5')

if [ "$DEVICE_CODE" == "null" ] || [ -z "$DEVICE_CODE" ]; then
    echo "❌ Failed to get device code"
    echo "Response: $RESPONSE"
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
    POLL_RESPONSE=$(curl -s -X POST "$API_URL/auth/device/token" \
      -H "Content-Type: application/json" \
      -d "{
        \"grant_type\": \"urn:ietf:params:oauth:grant-type:device_code\",
        \"device_code\": \"$DEVICE_CODE\",
        \"client_id\": \"$CLIENT_ID\"
      }")
    
    ERROR=$(echo $POLL_RESPONSE | jq -r '.error // "null"')
    ACCESS_TOKEN=$(echo $POLL_RESPONSE | jq -r '.access_token // .accessToken // "null"')
    
    if [ "$ERROR" == "authorization_pending" ]; then
        echo "⏳ Authorization pending... waiting ${INTERVAL}s"
        sleep $INTERVAL
    elif [ "$ACCESS_TOKEN" != "null" ] && [ -n "$ACCESS_TOKEN" ]; then
        echo "✅ Got session token!"
        echo "   Token: ${ACCESS_TOKEN:0:20}..."
        break
    elif [ "$ERROR" != "null" ]; then
        echo "❌ Error: $ERROR"
        echo "Response: $POLL_RESPONSE"
        exit 1
    else
        echo "⏳ Waiting... (response: $POLL_RESPONSE)"
        sleep $INTERVAL
    fi
done

echo ""
echo "3. Exchanging session token for API key..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

EXCHANGE_RESPONSE=$(curl -s -X POST "$API_URL/device/exchange-for-api-key" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

API_KEY=$(echo $EXCHANGE_RESPONSE | jq -r '.api_key // "null"')
KEY_NAME=$(echo $EXCHANGE_RESPONSE | jq -r '.key_name // "null"')

if [ "$API_KEY" == "null" ] || [ -z "$API_KEY" ]; then
    echo "❌ Failed to exchange for API key"
    echo "Response: $EXCHANGE_RESPONSE"
    exit 1
fi

echo "✅ Got API key!"
echo "   Key Name: $KEY_NAME"
echo "   API Key: ${API_KEY:0:15}..."
echo ""

echo "4. Testing API key with /api/generate..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "4a. GET /api/generate/v1/models"
MODELS_RESPONSE=$(curl -s "$API_URL/generate/v1/models" -H "Authorization: Bearer $API_KEY")
echo "Models: $(echo $MODELS_RESPONSE | jq -r '.data[].id' 2>/dev/null | head -5 || echo "$MODELS_RESPONSE")"

echo ""
echo "=============================================="
echo "✅ Device Flow Complete!"
echo "=============================================="
echo ""
echo "Your API key is ready to use:"
echo ""
echo "  export POLLINATIONS_API_KEY='$API_KEY'"
echo ""
echo "  # Generate text"
echo "  curl -H 'Authorization: Bearer \$POLLINATIONS_API_KEY' \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"model\": \"openai\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello!\"}]}' \\"
echo "       $API_URL/generate/v1/chat/completions"
echo ""
