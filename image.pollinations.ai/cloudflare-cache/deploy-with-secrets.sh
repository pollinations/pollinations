#!/bin/bash

# Script to deploy Cloudflare Worker with secrets from .env file
# This script requires wrangler to be installed and you to be logged in

# Load variables from .env file
if [ -f "../.env" ]; then
  echo "Loading secrets from .env file..."
  export $(grep -v '^#' ../.env | xargs)
else
  echo "Error: .env file not found in parent directory"
  exit 1
fi

# Check if the required variables are set
if [ -z "$GA_MEASUREMENT_ID" ] || [ -z "$GA_API_SECRET" ]; then
  echo "Warning: GA_MEASUREMENT_ID or GA_API_SECRET not found in .env file"
  echo "Analytics will not be properly configured."
fi

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID not found in .env file"
  exit 1
fi

# First, make sure we're in the correct directory
cd "$(dirname "$0")" || exit

# Set the secrets using wrangler
if [ -n "$GA_MEASUREMENT_ID" ]; then
  echo "Setting GA_MEASUREMENT_ID secret..."
  echo "$GA_MEASUREMENT_ID" | wrangler secret put GA_MEASUREMENT_ID
fi

if [ -n "$GA_API_SECRET" ]; then
  echo "Setting GA_API_SECRET secret..."
  echo "$GA_API_SECRET" | wrangler secret put GA_API_SECRET
fi

# Set the account ID
echo "Setting ACCOUNT_ID secret..."
echo "$CLOUDFLARE_ACCOUNT_ID" | wrangler secret put ACCOUNT_ID

# Deploy the worker
echo "Deploying the worker..."
wrangler deploy

echo "Deployment complete!"
