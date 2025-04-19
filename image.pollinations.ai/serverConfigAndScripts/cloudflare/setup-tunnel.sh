#!/bin/bash

# Check if script is run with required arguments
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <subdomain> <domain> <local_port>"
    echo "Example: $0 image2 pollinations.ai 16384"
    exit 1
fi

SUBDOMAIN=$1
DOMAIN=$2
LOCAL_PORT=$3
HOSTNAME="${SUBDOMAIN}.${DOMAIN}"

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
CONFIG_DIR="$(dirname "$0")"
cp "$CONFIG_DIR/config.yml" ~/.cloudflared/config.yml
sed -i "s/tunnel: .*/tunnel: ${TUNNEL_ID}/" ~/.cloudflared/config.yml
sed -i "s/hostname: .*/hostname: ${HOSTNAME}/" ~/.cloudflared/config.yml
sed -i "s/localhost:[0-9]*/localhost:${LOCAL_PORT}/" ~/.cloudflared/config.yml

# Create systemd service
echo "Creating systemd service..."
sudo bash -c "cat > /etc/systemd/system/cloudflared.service << EOL
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/local/bin/cloudflared tunnel run ${TUNNEL_ID}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOL"

# Start and enable the service
echo "Starting cloudflared service..."
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

echo "Setup complete!"
echo "Tunnel ID: ${TUNNEL_ID}"
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
