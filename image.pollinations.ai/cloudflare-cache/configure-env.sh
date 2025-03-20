#!/bin/bash
# Script to configure environment variables for Cloudflare worker
# This script can read from .env file or environment variables

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to read value from .env file
read_from_env() {
    local key=$1
    local env_file="../.env"
    if [ -f "$env_file" ]; then
        local value=$(grep "^$key=" "$env_file" | cut -d '=' -f2)
        echo "$value"
    fi
}

echo -e "${BLUE}Configuring environment variables for Cloudflare worker...${NC}"

# Try to get values from environment variables first, then fall back to .env file
GA_ID=${GA_MEASUREMENT_ID:-$(read_from_env "GA_MEASUREMENT_ID")}
GA_SECRET=${GA_API_SECRET:-$(read_from_env "GA_API_SECRET")}
ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-$(read_from_env "CLOUDFLARE_ACCOUNT_ID")}

# Check if we have the required values
if [ -z "$GA_ID" ] || [ -z "$GA_SECRET" ]; then
    echo -e "${YELLOW}Warning: GA_MEASUREMENT_ID and/or GA_API_SECRET not found in environment or .env file${NC}"
    echo -e "${YELLOW}Would you like to enter them manually? (y/n)${NC}"
    read -r manual_entry
    
    if [[ $manual_entry =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Enter your Google Analytics Measurement ID (e.g., G-XXXXXXXXXX):${NC}"
        read -r GA_ID
        
        echo -e "${BLUE}Enter your Google Analytics API Secret:${NC}"
        read -r GA_SECRET
    else
        echo -e "${YELLOW}Skipping Google Analytics configuration.${NC}"
    fi
fi

# Check if we have the Cloudflare account ID
if [ -z "$ACCOUNT_ID" ]; then
    echo -e "${YELLOW}Warning: CLOUDFLARE_ACCOUNT_ID not found in environment or .env file${NC}"
    echo -e "${YELLOW}Would you like to enter it manually? (y/n)${NC}"
    read -r manual_entry
    
    if [[ $manual_entry =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Enter your Cloudflare Account ID:${NC}"
        read -r ACCOUNT_ID
    else
        echo -e "${YELLOW}Skipping Cloudflare Account ID configuration.${NC}"
    fi
fi

# Set secrets using wrangler
echo -e "${GREEN}Setting secrets using wrangler...${NC}"

if [ -n "$GA_ID" ]; then
    echo "$GA_ID" | npx wrangler secret put GA_MEASUREMENT_ID
fi

if [ -n "$GA_SECRET" ]; then
    echo "$GA_SECRET" | npx wrangler secret put GA_API_SECRET
fi

if [ -n "$ACCOUNT_ID" ]; then
    echo "$ACCOUNT_ID" | npx wrangler secret put ACCOUNT_ID
fi

echo -e "${GREEN}Environment variables configured as Cloudflare secrets${NC}"
