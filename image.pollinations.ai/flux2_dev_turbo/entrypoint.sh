#!/bin/bash
set -e

cd /app
source venv/bin/activate

SECRETS_FILE="../secrets/env.json"
if [ -f "$SECRETS_FILE" ]; then
    export PLN_ENTER_TOKEN=$(sops -d "$SECRETS_FILE" 2>/dev/null | grep '"PLN_ENTER_TOKEN"' | cut -d'"' -f4)
fi

export PORT=${PORT:-10003}
export PUBLIC_IP=${PUBLIC_IP:-$(curl -s https://api.ipify.org)}
export SERVICE_TYPE=${SERVICE_TYPE:-flux2-dev-turbo}

echo "Starting FLUX.2-dev-Turbo server on port $PORT..."
