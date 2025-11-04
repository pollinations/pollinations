#!/bin/bash
# Deploy a single Hacktoberfest app to Cloudflare Pages
# Reads config from apps.json, builds if needed, deploys to <app-name>.pollinations.ai

set -e

APP_NAME="$1"

if [ -z "$APP_NAME" ]; then
  echo "❌ Usage: $0 <app-name>"
  echo ""
  echo "Available apps:"
  jq -r 'keys[]' hacktoberfest-2025/apps.json 2>/dev/null | sed 's/^/  - /' || echo "  (no apps.json found)"
  echo ""
  echo "Example: $0 ai-dungeon-master"
  exit 1
fi

# Check if app exists
if [ ! -d "hacktoberfest-2025/$APP_NAME" ]; then
  echo "❌ App directory not found: hacktoberfest-2025/$APP_NAME"
  exit 1
fi

# Check if app is in apps.json
if ! jq -e ".\"$APP_NAME\"" hacktoberfest-2025/apps.json > /dev/null 2>&1; then
  echo "❌ App not found in apps.json: $APP_NAME"
  exit 1
fi

echo "🚀 Deploying $APP_NAME..."

# Step 1: Setup infrastructure (project, domain, DNS)
echo "📦 Setting up infrastructure..."
cd hacktoberfest-2025
node scripts/deploy-app.js "$APP_NAME" || echo "⚠️  Infrastructure setup completed with warnings"
cd ..

# Step 2: Build if needed
BUILD_CMD=$(jq -r ".\"$APP_NAME\".buildCommand // empty" hacktoberfest-2025/apps.json)
OUTPUT_DIR=$(jq -r ".\"$APP_NAME\".outputDir // \".\"" hacktoberfest-2025/apps.json)

if [ -n "$BUILD_CMD" ] && [ "$BUILD_CMD" != "null" ]; then
  echo "🔨 Building app with: $BUILD_CMD"
  cd "hacktoberfest-2025/$APP_NAME"
  
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
wrangler pages deploy "hacktoberfest-2025/$APP_NAME/$OUTPUT_DIR" \
  --project-name="hacktoberfest-$APP_NAME" \
  --branch=main \
  --commit-dirty=true

echo "✅ Deployment complete for $APP_NAME"
echo "🔗 App available at: https://$APP_NAME.pollinations.ai"
