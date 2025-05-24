#!/bin/bash

# Check if .dev.vars exists
if [ ! -f ".dev.vars" ]; then
  echo "Error: .dev.vars file not found!"
  exit 1
fi

# Load environment variables from .dev.vars
export $(grep -v '^#' .dev.vars | xargs)

# Deploy with environment variables from .dev.vars
npx wrangler deploy --env production \
  --var "GITHUB_CLIENT_ID:$GITHUB_CLIENT_ID" \
  --var "GITHUB_CLIENT_SECRET:$GITHUB_CLIENT_SECRET" \
  --var "JWT_SECRET:$JWT_SECRET"

# Success message
echo "Deployment completed successfully!"
