#!/bin/bash

# Simplified script to deploy Cloudflare Worker using environment variables from .env
# This script requires wrangler to be installed and you to be logged in

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load variables from .env file
if [ -f "../.env" ]; then
  echo -e "${BLUE}Loading environment variables from .env file...${NC}"
  export $(grep -v '^#' ../.env | xargs)
else
  echo -e "${YELLOW}Warning: .env file not found in parent directory. Using existing environment variables.${NC}"
fi

# First, make sure we're in the correct directory
cd "$(dirname "$0")" || exit

# Check for required tools
if ! command -v wrangler &> /dev/null; then
  echo -e "${YELLOW}Wrangler not found. Installing...${NC}"
  npm install -g wrangler
fi

# Check if required environment variables are set
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo -e "${YELLOW}Error: CLOUDFLARE_ACCOUNT_ID not found in environment variables or .env file${NC}"
  exit 1
fi

if [ -z "$GA_MEASUREMENT_ID" ] || [ -z "$GA_API_SECRET" ]; then
  echo -e "${YELLOW}Warning: GA_MEASUREMENT_ID or GA_API_SECRET not set. Analytics may not work correctly.${NC}"
fi

# Create R2 bucket if it doesn't exist
BUCKET_NAME="pollinations-images"
echo -e "${GREEN}Ensuring R2 bucket exists: ${BUCKET_NAME}...${NC}"
wrangler r2 bucket create $BUCKET_NAME 2>/dev/null || true

# Create .dev.vars file for local development if it doesn't exist
if [ ! -f ".dev.vars" ]; then
  echo -e "${BLUE}Creating .dev.vars file for local development...${NC}"
  cat > .dev.vars << EOF
# Generated from .env on $(date)
GA_MEASUREMENT_ID=${GA_MEASUREMENT_ID}
GA_API_SECRET=${GA_API_SECRET}
EOF
  echo -e "${GREEN}.dev.vars file created for local development.${NC}"
fi

# Deploy the worker
echo -e "${GREEN}Deploying worker...${NC}"
wrangler deploy

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${YELLOW}Important: Make sure your DNS settings point image.pollinations.ai to your worker${NC}" 