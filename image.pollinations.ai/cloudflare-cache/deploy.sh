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

# Setup Vectorize metadata indexes (required for semantic caching)
echo -e "${GREEN}Setting up Vectorize metadata indexes...${NC}"
if [ -f "scripts/setup-vectorize-indexes.sh" ]; then
  ./scripts/setup-vectorize-indexes.sh
else
  echo -e "${YELLOW}Warning: setup-vectorize-indexes.sh script not found. Setting up indexes manually...${NC}"
  
  INDEX_NAME="pollinations-image-cache"
  
  # Function to create index if it doesn't exist
  create_index_if_missing() {
    local property_name=$1
    local property_type=$2
    
    echo "📋 Checking metadata index '$property_name'..."
    if wrangler vectorize list-metadata-index $INDEX_NAME | grep -q "$property_name"; then
      echo "✅ Metadata index '$property_name' already exists"
    else
      echo "🔧 Creating metadata index '$property_name'..."
      wrangler vectorize create-metadata-index $INDEX_NAME --property-name $property_name --type $property_type
    fi
  }
  
  # Required metadata indexes for semantic caching
  create_index_if_missing "bucket" "string"
  create_index_if_missing "model" "string"
  create_index_if_missing "seed" "string"
fi

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