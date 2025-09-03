#!/bin/bash

# Install FLUX Schnell as systemd service
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/flux-server.service"

echo "Installing FLUX Schnell systemd service..."

# Stop any existing service
sudo systemctl stop flux-server 2>/dev/null || true

# Copy service file to systemd directory
sudo cp "$SERVICE_FILE" /etc/systemd/system/

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable flux-server

echo "Service installed successfully!"
echo "Commands:"
echo "  Start:   sudo systemctl start flux-server"
echo "  Stop:    sudo systemctl stop flux-server"
echo "  Status:  sudo systemctl status flux-server"
echo "  Logs:    sudo journalctl -u flux-server -f"
