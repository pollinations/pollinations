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
SUBDOMAIN=$(echo "$CONFIG" | node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(c.subdomain || process.argv[1])" "$APP_NAME")
PROJECT_NAME="apps-$SUBDOMAIN"

echo "📦 App: $APP_NAME"
echo "📋 Project: $PROJECT_NAME"
echo "🌐 Subdomain: $SUBDOMAIN"
echo "📁 Output: $OUTPUT_DIR"

# Apps ship committed brand assets (favicons/icons/OG/manifest). After an app
# migrates to the design-system logo, regenerate them via tools/icons.

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
cd "$APP_PATH"
if [ -f "package.json" ]; then
    npm install --silent

    if grep -qF "../../packages/" package.json; then
        echo "📦 Installing monorepo package dependencies..."
        npm install --silent --prefix "$REPO_ROOT"
    fi
fi

# Step 3: Build
if [ -n "$BUILD_CMD" ] && [ "$BUILD_CMD" != "null" ]; then
    echo ""
    echo "🔨 Building..."
    eval "$BUILD_CMD"
fi

# Step 4: Provision the Myceli origin before upload
echo ""
echo "☁️ Provisioning Myceli origin..."
node "$SCRIPT_DIR/deploy-app.js" "$APP_NAME" --phase=origin

# Step 5: Upload content to Cloudflare Pages
echo ""
echo "🚀 Uploading to Cloudflare Pages..."
npx wrangler pages deploy "$APP_PATH/$OUTPUT_DIR" \
    --project-name="$PROJECT_NAME" \
    --branch=production \
    --commit-dirty=true

# Step 6: Gate on the Myceli origin before public cutover
echo ""
echo "⏳ Waiting for https://$SUBDOMAIN.myceli.ai to serve..."
for i in $(seq 1 30); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$SUBDOMAIN.myceli.ai" || echo "000")
    if [ "$CODE" = "200" ]; then
        echo "✅ Origin live"
        break
    fi
    if [ "$i" = "30" ]; then
        echo "❌ Origin not live (last: $CODE) — aborting before cutover"
        exit 1
    fi
    sleep 10
done

# Step 7: Public cutover after origin verification
echo ""
echo "🔀 Cutting over public domain..."
node "$SCRIPT_DIR/deploy-app.js" "$APP_NAME" --phase=cutover

# Step 8: Verify the public URL serves through the proxy
echo ""
echo "⏳ Verifying https://$SUBDOMAIN.pollinations.ai ..."
for i in $(seq 1 30); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$SUBDOMAIN.pollinations.ai" || echo "000")
    if [ "$CODE" = "200" ]; then
        echo "✅ Public URL live"
        break
    fi
    if [ "$i" = "30" ]; then
        echo "❌ Public URL not serving (last: $CODE) — investigate before retrying"
        exit 1
    fi
    sleep 10
done

echo ""
echo "✅ Deployed: https://$SUBDOMAIN.pollinations.ai (origin: https://$SUBDOMAIN.myceli.ai)"
