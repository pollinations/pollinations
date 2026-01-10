#!/bin/bash
set -e

# Setup Pollinations Services on New Machine
# Usage: bash setup-services.sh [repo-path]
# Example: bash setup-services.sh /home/ubuntu/pollinations

REPO_PATH="${1:-.}"
REPO_PATH="$(cd "$REPO_PATH" && pwd)"

echo "🚀 Setting up Pollinations services..."
echo "📁 Repository: $REPO_PATH"

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
echo "🎉 Setup complete!"
echo ""
echo "📊 Service Management:"
echo "  Status:  sudo systemctl status text-pollinations.service image-pollinations.service"
echo "  Logs:    sudo journalctl -u text-pollinations.service -f"
echo "  Restart: sudo systemctl restart text-pollinations.service image-pollinations.service"
echo "  Stop:    sudo systemctl stop text-pollinations.service image-pollinations.service"
