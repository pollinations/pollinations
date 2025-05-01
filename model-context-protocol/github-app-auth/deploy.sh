#!/bin/bash
# Deployment script for GitHub App authentication service
# Following the "thin proxy" design principle for Pollinations

echo "Deploying GitHub App authentication service to Cloudflare..."

# Check if GITHUB_CLIENT_SECRET is provided
if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh <GITHUB_CLIENT_SECRET>"
  echo "Please provide the GitHub Client Secret as an argument."
  exit 1
fi

# Set the GitHub Client Secret as a Cloudflare secret
echo "Setting up GitHub Client Secret..."
echo "$1" | npx wrangler secret put GITHUB_CLIENT_SECRET --name github-app-auth

# Deploy the worker to Cloudflare
echo "Deploying worker to Cloudflare..."
npx wrangler deploy

# Initialize the D1 database in production
echo "Initializing D1 database in production..."
npx wrangler d1 execute github_auth --file=schema.sql --remote

echo "Deployment completed successfully!"
echo "The GitHub App authentication service is now available at:"
echo "- Worker URL: https://github-app-auth.thomash-efd.workers.dev"
echo "- Custom Domain: https://auth.pollinations.ai"
