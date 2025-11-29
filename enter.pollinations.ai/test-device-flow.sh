#!/bin/bash

API_URL="http://localhost:3001/api"

echo "1. Requesting device code..."
RESPONSE=$(curl -s -X POST "$API_URL/device/code")
echo "Response: $RESPONSE"

DEVICE_CODE=$(echo $RESPONSE | jq -r '.device_code')
USER_CODE=$(echo $RESPONSE | jq -r '.user_code')
VERIFICATION_URI=$(echo $RESPONSE | jq -r '.verification_uri')

if [ "$DEVICE_CODE" == "null" ]; then
    echo "Failed to get device code"
    exit 1
fi

echo ""
echo "Device Code: $DEVICE_CODE"
echo "User Code: $USER_CODE"
echo "Verification URI: $VERIFICATION_URI"
echo ""
echo "Please visit $VERIFICATION_URI?code=$USER_CODE to authorize this device"
echo ""
echo "Waiting for authorization..."
sleep 2

echo "2. Polling for token..."
while true; do
    POLL_RESPONSE=$(curl -s -X POST "$API_URL/device/token" -H "Content-Type: application/json" -d "{\"device_code\": \"$DEVICE_CODE\"}")
    ERROR=$(echo $POLL_RESPONSE | jq -r '.error')
    
    if [ "$ERROR" == "authorization_pending" ]; then
        echo "Authorization pending... waiting 5s"
        sleep 5
    elif [ "$ERROR" == "null" ]; then
        ACCESS_TOKEN=$(echo $POLL_RESPONSE | jq -r '.access_token')
        echo "Success! Access Token: $ACCESS_TOKEN"
        break
    else
        echo "Error: $ERROR"
        exit 1
    fi
done

echo ""
echo "3. Verifying token..."
# The token is a session token, needs to be used as a cookie
SESSION_RESPONSE=$(curl -s "$API_URL/auth/session" -H "Cookie: better-auth.session_token=$ACCESS_TOKEN")
echo "Session Response: $SESSION_RESPONSE"

# Test a protected endpoint (list API keys)
echo ""
echo "4. Testing protected endpoint (API key list)..."
API_KEYS_RESPONSE=$(curl -s "$API_URL/auth/api-key/list" -H "Cookie: better-auth.session_token=$ACCESS_TOKEN")
echo "API Keys: $API_KEYS_RESPONSE"
