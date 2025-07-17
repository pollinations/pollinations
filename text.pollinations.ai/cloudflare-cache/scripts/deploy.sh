#!/bin/bash

set -e  # Exit on any error

# Check for environment parameter
ENV=${1:-"production"}
if [ "$ENV" = "staging" ]; then
    ENV_FLAG="--env staging"
    ENV_NAME="staging"
else
    ENV_FLAG=""
    ENV_NAME="production"
fi

echo "🚀 Starting $ENV_NAME deployment process..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create one with your secrets."
    exit 1
fi

echo "🔐 Setting up secrets from .env for $ENV_NAME..."

# Read .env file and set each variable as a secret
while IFS='=' read -r key value; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" == \#* ]] && continue
    
    # Remove quotes from value if present
    value=$(echo "$value" | sed "s/^[\"']*//;s/[\"']*$//")
    
    echo "🔐 Setting secret: $key"
    echo "$value" | wrangler secret put "$key" $ENV_FLAG
done < .env

echo ""
echo "✅ All secrets set successfully!"
echo "🚀 Deploying worker to $ENV_NAME..."

wrangler deploy $ENV_FLAG

echo ""
echo "✅ Deployment complete!"
if [ "$ENV" = "staging" ]; then
    echo "🎉 Your staging Worker is now live at: https://pollinations-text-cache-staging.<YOUR_SUBDOMAIN>.workers.dev"
else
    echo "🎉 Your production Worker is now live with updated secrets!"
fi
