#!/bin/bash
# Unified deploy script for Pollinations apps
# Usage: ./deploy.sh <app_name>

set -e

APP_NAME=$1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPS_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$APPS_DIR")"

if [ -z "$APP_NAME" ]; then
    echo "❌ Usage: ./deploy.sh <app_name>"
    exit 1
fi

APP_PATH="$APPS_DIR/$APP_NAME"
if [ ! -d "$APP_PATH" ]; then
    echo "❌ App not found: $APP_PATH"
    exit 1
fi

echo "🚀 Deploying $APP_NAME"
echo "================================"

# Get config from apps.json
CONFIG=$(node -e "
    const config = require('$APPS_DIR/apps.json');
    const app = config['$APP_NAME'];
    if (!app) { console.error('App not in apps.json'); process.exit(1); }
    console.log(JSON.stringify(app));
")

OUTPUT_DIR=$(echo "$CONFIG" | node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(c.outputDir || 'dist')")
BUILD_CMD=$(echo "$CONFIG" | node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(c.buildCommand || '')")
PROJECT_NAME="apps-$APP_NAME"

echo "📦 App: $APP_NAME"
echo "📋 Project: $PROJECT_NAME"
echo "📁 Output: $OUTPUT_DIR"

# Apps ship committed brand assets (favicons/icons/OG/manifest). After an app
# migrates to the design-system logo, regenerate them via tools/brand-assets.

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
cd "$APP_PATH"
if [ -f "package.json" ]; then
    npm install --silent
fi

# Step 3: Build
if [ -n "$BUILD_CMD" ] && [ "$BUILD_CMD" != "null" ]; then
    echo ""
    echo "🔨 Building..."
    eval "$BUILD_CMD"
fi

# Step 4: Setup Cloudflare infrastructure
echo ""
echo "☁️ Setting up Cloudflare infrastructure..."
node "$SCRIPT_DIR/deploy-app.js" "$APP_NAME"

# Step 5: Deploy to Cloudflare Pages
echo ""
echo "🚀 Deploying to Cloudflare Pages..."
npx wrangler pages deploy "$APP_PATH/$OUTPUT_DIR" \
    --project-name="$PROJECT_NAME" \
    --branch=production \
    --commit-dirty=true

echo ""
echo "✅ Deployed: https://$APP_NAME.pollinations.ai"
