#!/bin/bash

# Simple deployment script for the HTML wrapper service
# This script prepares the files for deployment to web.pollinations.ai

echo "Preparing HTML wrapper service for deployment..."

# Install dependencies
npm install

# Create a deployment package
mkdir -p deploy
cp server.js package.json deploy/

# Create a README for deployment
cat > deploy/README.md << EOL
# HTML Wrapper Service Deployment

This service is designed to be deployed to web.pollinations.ai using Cloudflare Workers.

## Files
- server.js - The main server implementation
- package.json - Dependencies and configuration

## Deployment Steps
1. Upload these files to your Cloudflare Workers environment
2. Configure the worker to handle requests at web.pollinations.ai/html
3. Set the PORT environment variable to the appropriate value

## Usage
Once deployed, the service can be accessed at:
https://web.pollinations.ai/html/Your prompt here
EOL

echo "Deployment package created in the 'deploy' directory"
echo "Follow the instructions in deploy/README.md to complete the deployment"
