#!/bin/bash

# Check if script is run with required arguments
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <subdomain> <domain> <local_port>"
    echo "Example: $0 text pollinations.ai 16385"
    exit 1
fi

SUBDOMAIN=$1
DOMAIN=$2
LOCAL_PORT=$3
HOSTNAME="${SUBDOMAIN}.${DOMAIN}"
SERVICE_NAME="cloudflared-${SUBDOMAIN}"

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

# Create new tunnel
echo "Creating tunnel..."
TUNNEL_NAME="${SUBDOMAIN}.${DOMAIN}"
TUNNEL_ID=$(cloudflared tunnel create "$TUNNEL_NAME" | grep -oP 'Created tunnel \K[a-f0-9-]+')
echo "Tunnel created with ID: $TUNNEL_ID"

# Create config file
echo "Creating config file..."
mkdir -p ~/.cloudflared
CONFIG_FILE=~/.cloudflared/config-${SUBDOMAIN}.yml
cat > $CONFIG_FILE << EOL
tunnel: ${TUNNEL_ID}
credentials-file: /home/ubuntu/.cloudflared/${TUNNEL_ID}.json

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
echo "Next steps:"
echo "1. In your authoritative DNS (e.g., Netlify), create a CNAME record:"
echo "   ${HOSTNAME} -> ${HOSTNAME}.cdn.cloudflare.net"
echo ""
echo "2. In Cloudflare dashboard, create a CNAME record:"
echo "   Name: ${SUBDOMAIN}"
echo "   Target: ${TUNNEL_ID}.cfargotunnel.com"
echo "   Proxy status: Proxied (Orange cloud)"
echo ""
echo "3. Verify your service is running on port ${LOCAL_PORT}"
echo ""
echo "To check the service status: sudo systemctl status ${SERVICE_NAME}"
