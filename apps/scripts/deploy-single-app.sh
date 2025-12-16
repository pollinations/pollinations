#!/bin/bash
# Deploy a single app to Cloudflare Pages
# Reads config from apps.json, builds if needed, deploys to <app-name>.pollinations.ai

set -e

APP_NAME="$1"

if [ -z "$APP_NAME" ]; then
  echo "❌ Usage: $0 <app-name>"
  echo ""
  echo "Available apps:"
  jq -r 'keys[]' apps/apps.json 2>/dev/null | sed 's/^/  - /' || echo "  (no apps.json found)"
  echo ""
  echo "Example: $0 ai-dungeon-master"
  exit 1
fi

# Check if app exists
if [ ! -d "apps/$APP_NAME" ]; then
  echo "❌ App directory not found: apps/$APP_NAME"
  exit 1
fi

# Check if app is in apps.json
if ! jq -e ".\"$APP_NAME\"" apps/apps.json > /dev/null 2>&1; then
  echo "❌ App not found in apps.json: $APP_NAME"
  exit 1
fi

echo "🚀 Deploying $APP_NAME..."

# Step 1: Setup infrastructure (project, domain, DNS)
echo "📦 Setting up infrastructure..."
cd apps
node scripts/deploy-app.js "$APP_NAME" || echo "⚠️  Infrastructure setup completed with warnings"
cd ..

# Step 2: Build if needed
BUILD_CMD=$(jq -r ".\"$APP_NAME\".buildCommand // empty" apps/apps.json)
OUTPUT_DIR=$(jq -r ".\"$APP_NAME\".outputDir // \".\"" apps/apps.json)

if [ -n "$BUILD_CMD" ] && [ "$BUILD_CMD" != "null" ]; then
  echo "🔨 Building app with: $BUILD_CMD"
  cd "apps/$APP_NAME"
  
  # Install dependencies if package.json exists
  if [ -f "package.json" ]; then
    echo "📦 Installing dependencies..."
    npm install
  fi
  
  # Run build command
  eval "$BUILD_CMD"
  cd ../..
else
  echo "⏭️  No build command specified, using source files directly"
fi

# Step 3: Deploy to Cloudflare Pages
echo "☁️  Deploying to Cloudflare Pages..."
wrangler pages deploy "apps/$APP_NAME/$OUTPUT_DIR" \
  --project-name="pollinations-$APP_NAME" \
  --branch=main \
  --commit-dirty=true

echo "✅ Deployment complete for $APP_NAME"
echo "🔗 App available at: https://$APP_NAME.pollinations.ai"
