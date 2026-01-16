#!/bin/bash
# Script to set up a Cloudflare tunnel for the Pollinations MCP server
# Usage: ./setup-cloudflare-tunnel.sh <tunnel-name> <domain> [http-port]

set -e

# Default values
TUNNEL_NAME=${1:-"flow-pollinations"}
DOMAIN=${2:-"flow.pollinations.ai"}
HTTP_PORT=${3:-31112}

echo "Setting up Cloudflare tunnel with the following configuration:"
echo "Tunnel Name: $TUNNEL_NAME"
echo "Domain: $DOMAIN"
echo "HTTP Port: $HTTP_PORT"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "Error: cloudflared is not installed. Please install it first."
    echo "Visit: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
    exit 1
fi

# Check if user is logged in to Cloudflare
echo "Checking Cloudflare authentication..."
if ! cloudflared tunnel list &> /dev/null; then
    echo "You need to log in to Cloudflare first."
    cloudflared login
fi

# Check if tunnel already exists
EXISTING_TUNNEL=$(cloudflared tunnel list | grep -w "$TUNNEL_NAME" || true)
if [ -n "$EXISTING_TUNNEL" ]; then
    echo "Tunnel '$TUNNEL_NAME' already exists. Using existing tunnel."
    # Extract tunnel ID using awk for better compatibility
    TUNNEL_ID=$(echo "$EXISTING_TUNNEL" | awk '{print $1}')
else
    # Create the tunnel
    echo "Creating Cloudflare tunnel: $TUNNEL_NAME"
    TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME")
    echo "$TUNNEL_OUTPUT"
    # Extract tunnel ID using awk for better compatibility
    TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | awk '/Created tunnel/ {print $3}')
fi

if [ -z "$TUNNEL_ID" ]; then
    echo "Failed to extract tunnel ID. Please check the output above."
    exit 1
fi

echo "Using tunnel ID: $TUNNEL_ID"

# Create DNS record
echo "Creating DNS record: $DOMAIN -> $TUNNEL_NAME"
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"

# Create config file
CONFIG_DIR="$(dirname "$(dirname "$0")")"
CONFIG_FILE="$CONFIG_DIR/cloudflared-config.yml"
echo "Creating configuration file: $CONFIG_FILE"

cat > "$CONFIG_FILE" << EOF
tunnel: $TUNNEL_ID
credentials-file: ~/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:$HTTP_PORT
  - service: http_status:404
EOF

echo "Configuration file created successfully."
echo ""
echo "To start the tunnel, run:"
echo "cloudflared tunnel --config $CONFIG_FILE run"
echo ""
echo "Or run directly with:"
echo "cloudflared tunnel run --url http://localhost:$HTTP_PORT $TUNNEL_ID"
echo ""
echo "To install as a service (recommended for production):"
echo "sudo cloudflared service install --config $CONFIG_FILE"
echo ""
echo "Note: It may take 5-15 minutes for SSL certificates to be provisioned."
echo "If you encounter SSL errors, please wait and try again later."
