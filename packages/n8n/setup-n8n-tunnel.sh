#!/bin/bash
set -e

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "cloudflared is not installed. Please install it first."
    exit 1
fi

# Setup variables
TUNNEL_NAME="n8n-pollinations"
echo "Setting up Cloudflare tunnel for n8n..."

# Check if tunnel already exists
TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
if [ -z "$TUNNEL_ID" ]; then
    # Create a new tunnel if it doesn't exist
    echo "Creating a new Cloudflare tunnel for n8n..."
    TUNNEL_ID=$(cloudflared tunnel create $TUNNEL_NAME | grep -oP 'Created tunnel \K[a-f0-9-]+')
    
    if [ -z "$TUNNEL_ID" ]; then
        echo "Failed to create tunnel. Please check your Cloudflare credentials."
        exit 1
    fi
    echo "Tunnel created with ID: $TUNNEL_ID"
else
    echo "Using existing tunnel with ID: $TUNNEL_ID"
fi

# Create config file
CONFIG_FILE="/home/ubuntu/.cloudflared/config-n8n.yml"
echo "Creating configuration file at $CONFIG_FILE..."

cat > $CONFIG_FILE << EOF
tunnel: $TUNNEL_ID
credentials-file: /home/ubuntu/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: n8n.pollinations.ai
    service: http://localhost:5678
  - service: http_status:404
EOF

echo "Configuration file created."

# Create systemd service file
SERVICE_FILE="/etc/systemd/system/cloudflared-n8n.service"
echo "Creating systemd service file at $SERVICE_FILE..."

sudo tee $SERVICE_FILE > /dev/null << EOF
[Unit]
Description=Cloudflare Tunnel for n8n.pollinations.ai
After=network.target

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/local/bin/cloudflared tunnel --config /home/ubuntu/.cloudflared/config-n8n.yml run $TUNNEL_ID
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "Service file created."

# Set up DNS (don't fail if it already exists)
echo "Setting up DNS for n8n.pollinations.ai..."
cloudflared tunnel route dns $TUNNEL_ID n8n.pollinations.ai || {
    echo "DNS setup skipped. Record may already exist, which is fine."
}

# Reload systemd, enable and start the service
echo "Enabling and starting the service..."
sudo systemctl daemon-reload
sudo systemctl enable cloudflared-n8n.service
sudo systemctl restart cloudflared-n8n.service

echo "Cloudflare tunnel for n8n has been set up successfully."
echo "You can access n8n at https://n8n.pollinations.ai"
echo "To check the status, run: sudo systemctl status cloudflared-n8n.service"
echo "To view logs, run: sudo journalctl -u cloudflared-n8n.service"
