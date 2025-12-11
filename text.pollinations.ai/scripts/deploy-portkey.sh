#!/bin/bash
# Deploy Portkey API Gateway to Cloudflare Workers
# This script fetches the Portkey gateway repo at a specific commit and deploys it

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

# Fetch specific commit (works regardless of depth/branch)
echo "📦 Fetching Portkey gateway at commit $PORTKEY_COMMIT..."
mkdir -p "$CLONE_DIR"
cd "$CLONE_DIR"
git init -q
git remote add origin "$PORTKEY_REPO"
git fetch --depth 1 origin "$PORTKEY_COMMIT"
git checkout FETCH_HEAD -q

# Verify commit
ACTUAL_COMMIT=$(git rev-parse HEAD)
if [ "$ACTUAL_COMMIT" != "$PORTKEY_COMMIT" ]; then
    echo "❌ Commit mismatch! Expected $PORTKEY_COMMIT but got $ACTUAL_COMMIT"
    exit 1
fi
echo "✓ Verified commit: $ACTUAL_COMMIT"

# Install dependencies
echo "📥 Installing dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install

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
cd - > /dev/null
rm -rf "$CLONE_DIR"

echo "✅ Portkey Gateway deployed successfully!"
