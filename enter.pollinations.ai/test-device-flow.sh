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
echo "3. Testing API key with /api/generate routes..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# The access_token is now a real sk_ API key that works with /api/generate
echo "3a. GET /api/generate/v1/models (list available text models)"
MODELS_RESPONSE=$(curl -s "$API_URL/generate/v1/models" -H "Authorization: Bearer $ACCESS_TOKEN")
echo "Models: $MODELS_RESPONSE" | jq '.data[].id' 2>/dev/null || echo "$MODELS_RESPONSE"

echo ""
echo "3b. POST /api/generate/v1/chat/completions (text generation)"
TEXT_RESPONSE=$(curl -s "$API_URL/generate/v1/chat/completions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Say hello in one word"}]}')
echo "Text Response: $TEXT_RESPONSE" | jq '.choices[0].message.content' 2>/dev/null || echo "$TEXT_RESPONSE"

echo ""
echo "3c. GET /api/generate/image/models (list available image models)"
IMAGE_MODELS=$(curl -s "$API_URL/generate/image/models" -H "Authorization: Bearer $ACCESS_TOKEN")
echo "Image Models: $IMAGE_MODELS" | jq '.[].name' 2>/dev/null || echo "$IMAGE_MODELS"

echo ""
echo "=============================================="
echo "✅ Device Flow Complete!"
echo "=============================================="
echo ""
echo "Your API key is ready to use:"
echo ""
echo "  export POLLINATIONS_API_KEY='$ACCESS_TOKEN'"
echo ""
echo "  # Generate text"
echo "  curl -H 'Authorization: Bearer \$POLLINATIONS_API_KEY' \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"model\": \"openai\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello!\"}]}' \\"
echo "       $API_URL/generate/v1/chat/completions"
echo ""
echo "  # Generate image"
echo "  curl -H 'Authorization: Bearer \$POLLINATIONS_API_KEY' \\"
echo "       '$API_URL/generate/image/A%20cute%20robot' -o robot.jpg"
echo ""
