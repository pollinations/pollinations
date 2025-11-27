#!/bin/bash
# Deploy Portkey API Gateway to Cloudflare Workers
# This script clones the Portkey gateway repo at a specific commit and deploys it

set -e

# Configuration
# Using pollinations fork with fix for Gemini completion_tokens including thoughtsTokenCount
# PR: https://github.com/Portkey-AI/gateway/pull/1458
PORTKEY_REPO="https://github.com/pollinations/gateway.git"
PORTKEY_COMMIT="${PORTKEY_COMMIT:-a1d5949d5a9ae052b1eea54b739f753f2fab22af}"  # fix/gemini-completion-tokens-include-thoughts
CLONE_DIR="/tmp/portkey-gateway-$$"
ENVIRONMENT="${PORTKEY_ENV:-production}"

echo "🚀 Deploying Portkey Gateway"
echo "   Commit: $PORTKEY_COMMIT"
echo "   Environment: $ENVIRONMENT"

# Clone the repository
echo "📦 Cloning Portkey gateway..."
git clone --depth 100 "$PORTKEY_REPO" "$CLONE_DIR"
cd "$CLONE_DIR"

# Checkout specific commit
echo "🔖 Checking out commit $PORTKEY_COMMIT..."
git checkout "$PORTKEY_COMMIT"

# Install dependencies
echo "📥 Installing dependencies..."
npm install

# Deploy to Cloudflare
echo "☁️ Deploying to Cloudflare Workers..."
if [ "$ENVIRONMENT" = "production" ]; then
    npx wrangler deploy --minify src/index.ts --env production
elif [ "$ENVIRONMENT" = "staging" ]; then
    npx wrangler deploy --minify src/index.ts --env staging
else
    npx wrangler deploy --minify src/index.ts
fi

# Cleanup
echo "🧹 Cleaning up..."
cd -
rm -rf "$CLONE_DIR"

echo "✅ Portkey Gateway deployed successfully!"
