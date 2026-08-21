#!/bin/bash
# Deploy Portkey API Gateway to Cloudflare Workers
# This script fetches the Portkey gateway repo at a specific commit and deploys it

set -e

# Configuration
# Using pollinations fork with upstream v1.15.2 merged + our custom patches
# Includes: upstream vulnerability fixes, forward-header loop prevention, Gemini/Vertex additions,
# and Vertex explicit context caching via cache_control markers
# PRs: https://github.com/pollinations/gateway/pull/5, https://github.com/pollinations/gateway/pull/8
PORTKEY_REPO="https://github.com/pollinations/gateway.git"
PORTKEY_COMMIT="${PORTKEY_COMMIT:-c187bd5898e191dec8a98dd78fad6b643fb86ba4}"  # v1.15.2 sync + vertex explicit caching (#8)
CLONE_DIR="/tmp/portkey-gateway-$$"
ENVIRONMENT="${PORTKEY_ENV:-production}"
PORTKEY_ACCOUNT_ID="${PORTKEY_ACCOUNT_ID:-b6ec751c0862027ba269faf7029b2501}"
PORTKEY_PRODUCTION_HOST="${PORTKEY_PRODUCTION_HOST:-portkey.myceli.ai}"
PORTKEY_PRODUCTION_ZONE="${PORTKEY_PRODUCTION_ZONE:-myceli.ai}"
PORTKEY_PUBLIC_HOST="${PORTKEY_PUBLIC_HOST:-portkey.pollinations.ai}"
PORTKEY_PUBLIC_ZONE="${PORTKEY_PUBLIC_ZONE:-pollinations.ai}"

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

if [ "$ENVIRONMENT" = "production" ]; then
    echo "Rewriting production routes to ${PORTKEY_PRODUCTION_HOST} and ${PORTKEY_PUBLIC_HOST}..."
    node <<'NODE'
const fs = require("fs");

const path = "wrangler.toml";
let config = fs.readFileSync(path, "utf8");

if (!/^account_id\s*=/.test(config)) {
    config = config.replace(
        /^(main\s*=\s*".*")$/m,
        `$1\naccount_id = "${process.env.PORTKEY_ACCOUNT_ID}"`,
    );
}

config = config.replace(
    /\{ pattern = "portkey\.pollinations\.ai", custom_domain = true \}/,
    `{ pattern = "${process.env.PORTKEY_PRODUCTION_HOST}", zone_name = "${process.env.PORTKEY_PRODUCTION_ZONE}", custom_domain = true },
    { pattern = "${process.env.PORTKEY_PUBLIC_HOST}", zone_name = "${process.env.PORTKEY_PUBLIC_ZONE}", custom_domain = true }`,
);

fs.writeFileSync(path, config);
NODE
fi

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
