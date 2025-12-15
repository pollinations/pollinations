#!/bin/bash
set -e

cd /home/ubuntu/pollinations/image.pollinations.ai/z-image
source venv/bin/activate
SECRETS_FILE="../secrets/env.json"
if [ -f "$SECRETS_FILE" ]; then
    export ENTER_TOKEN=$(sops -d "$SECRETS_FILE" 2>/dev/null | grep '"ENTER_TOKEN"' | cut -d'"' -f4)
fi
export PORT=10002
export PUBLIC_IP=${PUBLIC_IP:-$(curl -s https://api.ipify.org)}
export SERVICE_TYPE=zimage
exec python server.py
