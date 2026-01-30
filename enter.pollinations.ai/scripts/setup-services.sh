#!/bin/bash
set -e

# Setup Pollinations Services on New Machine
# Usage: bash setup-services.sh [repo-path] [--with-tunnel]
# Example: bash setup-services.sh /home/ubuntu/pollinations
# Example: bash setup-services.sh /home/ubuntu/pollinations --with-tunnel

REPO_PATH="${1:-.}"
REPO_PATH="$(cd "$REPO_PATH" && pwd)"
SETUP_TUNNEL=false

# Check for --with-tunnel flag
for arg in "$@"; do
  if [ "$arg" = "--with-tunnel" ]; then
    SETUP_TUNNEL=true
  fi
done

echo "🚀 Setting up Pollinations services..."
echo "📁 Repository: $REPO_PATH"
echo "🔒 Cloudflare Tunnel: $SETUP_TUNNEL"

# Check if repo exists
if [ ! -d "$REPO_PATH/text.pollinations.ai" ] || [ ! -d "$REPO_PATH/image.pollinations.ai" ]; then
  echo "❌ Error: Could not find text.pollinations.ai or image.pollinations.ai in $REPO_PATH"
  exit 1
fi

# Install Node.js if needed
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js v20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Install pnpm if needed
if ! command -v pnpm &> /dev/null; then
  echo "📦 Installing pnpm..."
  sudo npm install -g pnpm
fi

# Install dependencies
echo "📥 Installing dependencies..."
cd "$REPO_PATH/text.pollinations.ai"
pnpm install

cd "$REPO_PATH/image.pollinations.ai"
pnpm install

# Create systemd services
echo "⚙️  Creating systemd services..."

sudo tee /etc/systemd/system/text-pollinations.service > /dev/null << EOF
[Unit]
Description=Pollinations Text Service
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_PATH/text.pollinations.ai
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=text-pollinations
Environment="NODE_ENV=production"
Environment="DEBUG=pollinations:error"

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/image-pollinations.service > /dev/null << EOF
[Unit]
Description=Pollinations Image Service
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_PATH/image.pollinations.ai
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=image-pollinations
Environment="NODE_ENV=production"
Environment="DEBUG=pollinations:error"

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
echo "🔄 Enabling and starting services..."
sudo systemctl daemon-reload
sudo systemctl enable text-pollinations.service image-pollinations.service
sudo systemctl start text-pollinations.service image-pollinations.service

# Wait for services to start
sleep 3

# Verify
echo "✅ Verifying services..."
if sudo systemctl is-active --quiet text-pollinations.service; then
  echo "✓ text-pollinations.service is running (port 16385)"
else
  echo "✗ text-pollinations.service failed to start"
  sudo journalctl -u text-pollinations.service -n 20
  exit 1
fi

if sudo systemctl is-active --quiet image-pollinations.service; then
  echo "✓ image-pollinations.service is running (port 16384)"
else
  echo "✗ image-pollinations.service failed to start"
  sudo journalctl -u image-pollinations.service -n 20
  exit 1
fi

echo ""
echo "🎉 Basic setup complete!"

# Setup Cloudflare Tunnel if requested
if [ "$SETUP_TUNNEL" = true ]; then
  echo ""
  echo "🔒 Setting up Cloudflare Tunnel..."
  
  # Install cloudflared if not present
  if ! command -v cloudflared &> /dev/null; then
    echo "📦 Installing cloudflared..."
    curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i /tmp/cloudflared.deb
    rm /tmp/cloudflared.deb
  fi
  
  # Create deploy webhook service
  echo "⚙️  Creating deploy-webhook service..."
  sudo tee /etc/systemd/system/deploy-webhook.service > /dev/null << EOF
[Unit]
Description=Pollinations Deploy Webhook
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_PATH/enter.pollinations.ai/scripts
ExecStart=/usr/bin/node deploy-webhook.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
Environment="REPO_PATH=$REPO_PATH"

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable deploy-webhook.service
  
  echo ""
  echo "⚠️  MANUAL STEPS REQUIRED for Cloudflare Tunnel:"
  echo ""
  echo "1. Login to Cloudflare (run on server):"
  echo "   cloudflared tunnel login"
  echo ""
  echo "2. Create tunnel:"
  echo "   cloudflared tunnel create enter-services"
  echo ""
  echo "3. Create ~/.cloudflared/config.yml with:"
  echo "   tunnel: <TUNNEL_ID>"
  echo "   credentials-file: /home/ubuntu/.cloudflared/<TUNNEL_ID>.json"
  echo "   ingress:"
  echo "     - hostname: text-internal.pollinations.ai"
  echo "       service: http://localhost:16385"
  echo "     - hostname: image-internal.pollinations.ai"
  echo "       service: http://localhost:16384"
  echo "     - hostname: deploy.pollinations.ai"
  echo "       service: http://localhost:8787"
  echo "     - service: http_status:404"
  echo ""
  echo "4. Install tunnel as service:"
  echo "   sudo cloudflared service install"
  echo "   sudo systemctl enable cloudflared"
  echo "   sudo systemctl start cloudflared"
  echo ""
  echo "5. Create deploy token:"
  echo "   openssl rand -hex 32 > ~/.deploy-token"
  echo "   chmod 600 ~/.deploy-token"
  echo ""
  echo "6. Start deploy webhook:"
  echo "   sudo systemctl start deploy-webhook.service"
  echo ""
  echo "7. In Cloudflare Dashboard:"
  echo "   - Add DNS CNAME records pointing to <TUNNEL_ID>.cfargotunnel.com"
  echo "   - Create Access Application for deploy.pollinations.ai"
  echo "   - Create Service Token for GitHub Actions"
fi

echo ""
echo "📊 Service Management:"
echo "  Status:  sudo systemctl status text-pollinations.service image-pollinations.service"
echo "  Logs:    sudo journalctl -u text-pollinations.service -f"
echo "  Restart: sudo systemctl restart text-pollinations.service image-pollinations.service"
echo "  Stop:    sudo systemctl stop text-pollinations.service image-pollinations.service"
