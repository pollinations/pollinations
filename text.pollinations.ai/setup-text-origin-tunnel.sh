#!/bin/bash

# This script sets up a Cloudflare tunnel for text-origin.pollinations.ai
# pointing to the local text.pollinations.ai service

SUBDOMAIN="text-origin"
DOMAIN="pollinations.ai"
LOCAL_PORT=16385  # Assuming the text service runs on port 16385
HOSTNAME="${SUBDOMAIN}.${DOMAIN}"
SERVICE_NAME="cloudflared-${SUBDOMAIN}"
TUNNEL_ID="9161e140-dce4-40c1-85c6-ab754690a50f"  # This is the tunnel ID from the Cloudflare dashboard

# Install cloudflared if not present
if ! command -v cloudflared &> /dev/null; then
    echo "Installing cloudflared..."
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared.deb
    rm cloudflared.deb
fi

# Login to Cloudflare (this will open a browser)
echo "Please login to Cloudflare..."
cloudflared tunnel login

# Create config file
echo "Creating config file..."
mkdir -p ~/.cloudflared
CONFIG_FILE=~/.cloudflared/config-${SUBDOMAIN}.yml
cat > $CONFIG_FILE << EOL
tunnel: ${TUNNEL_ID}
credentials-file: ~/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: ${HOSTNAME}
    service: http://localhost:${LOCAL_PORT}
  - service: http_status:404
EOL

# Create systemd service with unique name
echo "Creating systemd service..."
sudo bash -c "cat > /etc/systemd/system/${SERVICE_NAME}.service << EOL
[Unit]
Description=Cloudflare Tunnel for ${HOSTNAME}
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/local/bin/cloudflared tunnel --config $CONFIG_FILE run ${TUNNEL_ID}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOL"

# Start and enable the service
echo "Starting cloudflared service..."
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl start ${SERVICE_NAME}

echo "Setup complete!"
echo "Tunnel ID: ${TUNNEL_ID}"
echo "Service name: ${SERVICE_NAME}"
echo ""
echo "Verify your service is running on port ${LOCAL_PORT}"
echo ""
echo "To check the service status: sudo systemctl status ${SERVICE_NAME}"
