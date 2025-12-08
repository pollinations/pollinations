#!/bin/bash
set -e

cd /home/ubuntu/pollinations/image.pollinations.ai/z-image

# Activate virtual environment
source venv/bin/activate

# Decrypt secrets from image.pollinations.ai
SECRETS_FILE="../secrets/env.json"
if [ -f "$SECRETS_FILE" ]; then
    export ENTER_TOKEN=$(sops -d "$SECRETS_FILE" 2>/dev/null | grep '"ENTER_TOKEN"' | cut -d'"' -f4)
fi

# Set environment variables
export PORT=10002
export PUBLIC_IP=98.91.185.88
export SERVICE_TYPE=zimage

# Run the server
exec python server.py
