#!/bin/bash
# Deploy Portkey API Gateway to Cloudflare Workers
# This script fetches the Portkey gateway repo at a specific commit and deploys it

set -e

# Configuration
# Using pollinations fork with upstream v1.15.2 merged + our custom patches
# Includes: upstream vulnerability fixes, forward-header loop prevention, and Gemini/Vertex additions
# PR: https://github.com/pollinations/gateway/pull/5
PORTKEY_REPO="https://github.com/pollinations/gateway.git"
PORTKEY_COMMIT="${PORTKEY_COMMIT:-c0de03381d2aad52045b405ac21aef1972cd9d8e}"  # v1.15.2 sync + fork patches (merge commit on main)
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
