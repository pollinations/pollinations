#!/bin/bash

# Script to deploy secrets from .dev.vars to Cloudflare Workers
# Usage: ./deploy-secrets.sh

set -e

echo "🔐 Deploying secrets from .dev.vars to Cloudflare Workers..."

# Check if .dev.vars exists
if [ ! -f ".dev.vars" ]; then
    echo "❌ Error: .dev.vars file not found!"
    echo "Please make sure you're in the correct directory and .dev.vars exists."
    exit 1
fi

# Read .dev.vars and deploy each secret
while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip empty lines and comments
    if [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]]; then
        continue
    fi
    
    # Remove any leading/trailing whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    
    if [[ -n "$key" && -n "$value" ]]; then
        echo "🔑 Setting secret: $key"
        echo "$value" | wrangler secret put "$key"
        if [ $? -eq 0 ]; then
            echo "✅ Successfully set $key"
        else
            echo "❌ Failed to set $key"
            exit 1
        fi
        echo ""
    fi
done < .dev.vars

echo "🎉 All secrets deployed successfully!"
echo ""
echo "You can now deploy your worker with:"
echo "  wrangler deploy"
