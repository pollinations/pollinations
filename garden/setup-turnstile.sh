#!/bin/bash
set -e

# Setup Turnstile widget for Pollinations Garden
# Usage: ./setup-turnstile.sh

echo "🔐 Setting up Turnstile widget..."

# Get account ID from wrangler
ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}')

if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Could not get account ID. Run 'wrangler login' first."
  exit 1
fi

echo "✅ Account ID: $ACCOUNT_ID"

# Check if we have API token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN not set"
  echo "Create one at: https://dash.cloudflare.com/profile/api-tokens"
  echo "Required permissions: Account Settings Write, Turnstile Sites Write"
  echo ""
  echo "Then run: export CLOUDFLARE_API_TOKEN=your_token_here"
  exit 1
fi

# Create widget
echo "📝 Creating Turnstile widget..."

RESPONSE=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/challenges/widgets" \
  --request POST \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "Pollinations Garden",
    "mode": "invisible",
    "domains": ["localhost"]
  }')

# Check for errors
if echo "$RESPONSE" | grep -q '"success":false'; then
  echo "❌ Failed to create widget:"
  echo "$RESPONSE" | jq .
  exit 1
fi

# Extract sitekey and secret
SITEKEY=$(echo "$RESPONSE" | jq -r '.result.sitekey')
SECRET=$(echo "$RESPONSE" | jq -r '.result.secret')

echo ""
echo "✅ Turnstile widget created!"
echo ""
echo "📋 Save these values:"
echo ""
echo "TURNSTILE_SITEKEY=$SITEKEY"
echo "TURNSTILE_SECRET=$SECRET"
echo ""
echo "💾 Saving to .env files..."

# Save to text API
if [ -d "../text.pollinations.ai" ]; then
  echo "TURNSTILE_SECRET=$SECRET" >> ../text.pollinations.ai/.env
  echo "✅ Added to text.pollinations.ai/.env"
fi

# Save to image API (needs wrangler secret)
if [ -d "../image.pollinations.ai" ]; then
  echo "$SECRET" | wrangler secret put TURNSTILE_SECRET --cwd ../image.pollinations.ai
  echo "✅ Added to image.pollinations.ai secrets"
fi

# Update test file
sed -i.bak "s/1x00000000000000000000AA/$SITEKEY/" test-turnstile.html
rm test-turnstile.html.bak
echo "✅ Updated test-turnstile.html with production sitekey"

echo ""
echo "🎉 Setup complete! Next steps:"
echo "1. Open test-turnstile.html in browser"
echo "2. Check console for '✅ Turnstile token received'"
echo "3. Click 'Test API Call' button"
