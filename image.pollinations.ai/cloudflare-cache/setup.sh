#!/bin/bash
# Cloudflare R2 + CDN Setup Script
# This script creates an R2 bucket and deploys the worker

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Cloudflare R2 + CDN for Pollinations...${NC}"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${YELLOW}Wrangler not found. Installing...${NC}"
    npm install -g wrangler
fi

# Login to Cloudflare if needed
echo -e "${GREEN}Logging in to Cloudflare...${NC}"
wrangler login

# Create R2 bucket if it doesn't exist
BUCKET_NAME="pollinations-images"
echo -e "${GREEN}Creating R2 bucket: ${BUCKET_NAME}...${NC}"
wrangler r2 bucket create $BUCKET_NAME

# Install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
npm install

# Deploy the worker
echo -e "${GREEN}Deploying worker...${NC}"
npm run deploy

echo -e "${GREEN}Setup complete!${NC}"
echo -e "${GREEN}Your Cloudflare R2 + CDN cache is now deployed.${NC}"
