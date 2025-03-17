#!/bin/bash
# Cloudflare R2 + CDN Setup Script
# This script creates an R2 bucket and deploys the worker

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Setup analytics environment variables
echo -e "${BLUE}Setting up Google Analytics for the worker...${NC}"
echo -e "${YELLOW}Do you want to configure Google Analytics for the worker? (y/n)${NC}"
read -r setup_analytics

if [[ $setup_analytics =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Enter your Google Analytics Measurement ID (e.g., G-XXXXXXXXXX):${NC}"
    read -r ga_id
    
    echo -e "${BLUE}Enter your Google Analytics API Secret:${NC}"
    read -r ga_secret
    
    # Update wrangler.toml file
    sed -i "s/# GA_MEASUREMENT_ID = \"G-XXXXXXXXXX\"/GA_MEASUREMENT_ID = \"$ga_id\"/g" wrangler.toml
    sed -i "s/# GA_API_SECRET = \"XXXXXXXXXX\"/GA_API_SECRET = \"$ga_secret\"/g" wrangler.toml
    
    echo -e "${GREEN}Google Analytics configuration added to wrangler.toml${NC}"
    echo -e "${YELLOW}Note: For production, consider using Wrangler secrets instead:${NC}"
    echo -e "${YELLOW}wrangler secret put GA_MEASUREMENT_ID${NC}"
    echo -e "${YELLOW}wrangler secret put GA_API_SECRET${NC}"
else
    echo -e "${YELLOW}Skipping Google Analytics setup.${NC}"
    echo -e "${YELLOW}Note: Analytics events won't be tracked without setting up the required variables.${NC}"
    echo -e "${YELLOW}You can set them up later in the Cloudflare dashboard or in wrangler.toml.${NC}"
fi

# Deploy the worker
echo -e "${GREEN}Deploying worker...${NC}"
npm run deploy

# Add custom domain to the worker
WORKER_NAME="pollinations-image-cache"
CUSTOM_DOMAIN="image.pollinations.ai"
echo -e "${GREEN}Adding custom domain: ${CUSTOM_DOMAIN} to worker: ${WORKER_NAME}...${NC}"
echo -e "${YELLOW}Note: You'll need to manually add the custom domain in the Cloudflare dashboard.${NC}"
echo -e "${YELLOW}Go to Workers & Pages > pollinations-image-cache > Triggers > Custom Domains > Add Custom Domain${NC}"
echo -e "${YELLOW}Enter: ${CUSTOM_DOMAIN}${NC}"

echo -e "${GREEN}Setup complete!${NC}"
echo -e "${GREEN}Your Cloudflare R2 + CDN cache is now deployed.${NC}"
echo -e "${YELLOW}Important: Make sure to update your DNS settings in the Cloudflare dashboard:${NC}"
echo -e "${YELLOW}1. Add a custom domain to your worker: ${CUSTOM_DOMAIN}${NC}"
echo -e "${YELLOW}2. Change the CNAME record for 'image' to point to 'pollinations-image-cache.thomash-efd.workers.dev' instead of the Cloudflare Tunnel.${NC}"
