#!/bin/bash
# Cloudflare R2 + CDN Setup Script for Text Service
# This script creates an R2 bucket and deploys the worker

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Cloudflare R2 + CDN for Pollinations Text Service...${NC}"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${YELLOW}Wrangler not found. Installing...${NC}"
    npm install -g wrangler
fi

# Login to Cloudflare if needed
echo -e "${GREEN}Logging in to Cloudflare...${NC}"
wrangler login

# Create R2 bucket if it doesn't exist
BUCKET_NAME="pollinations-text"
echo -e "${GREEN}Creating R2 bucket: ${BUCKET_NAME}...${NC}"
wrangler r2 bucket create $BUCKET_NAME

# Install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
npm install

# Deploy the worker
echo -e "${GREEN}Deploying worker...${NC}"
npm run deploy

# Add custom domain to the worker
WORKER_NAME="pollinations-text-cache"
CUSTOM_DOMAIN="text.pollinations.ai"
echo -e "${GREEN}Adding custom domain: ${CUSTOM_DOMAIN} to worker: ${WORKER_NAME}...${NC}"
echo -e "${YELLOW}Note: You'll need to manually add the custom domain in the Cloudflare dashboard.${NC}"
echo -e "${YELLOW}Go to Workers & Pages > pollinations-text-cache > Triggers > Custom Domains > Add Custom Domain${NC}"
echo -e "${YELLOW}Enter: ${CUSTOM_DOMAIN}${NC}"

echo -e "${GREEN}Setup complete!${NC}"
echo -e "${GREEN}Your Cloudflare R2 + CDN cache for text service is now deployed.${NC}"
echo -e "${YELLOW}Important: Make sure to update your DNS settings in the Cloudflare dashboard:${NC}"
echo -e "${YELLOW}1. Add a custom domain to your worker: ${CUSTOM_DOMAIN}${NC}"
echo -e "${YELLOW}2. Change the CNAME record for 'text' to point to 'pollinations-text-cache.thomash-efd.workers.dev' instead of the Cloudflare Tunnel.${NC}"