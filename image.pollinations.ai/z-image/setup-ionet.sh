#!/bin/bash
# Z-Image setup script for IO.net workers
# Run ON the instance after SSHing in
# Usage: GPU0_PUBLIC_PORT=24602 GPU1_PUBLIC_PORT=25962 bash setup-ionet.sh

set -e

PUBLIC_IP="${PUBLIC_IP:-52.205.25.210}"
PLN_ENTER_TOKEN="${PLN_ENTER_TOKEN:-cZOpvvV4xpbOe1IOYrN0R2a3zxHEAcLntneihfU3f2Y3Pfy5}"
BRANCH="${BRANCH:-feat/zimage-ionet-deployment}"

log() { echo "[$(date '+%H:%M:%S')] $1"; }

log "Starting Z-Image setup..."

# Clone or update repo
if [ -d "$HOME/pollinations" ]; then
    log "Updating repo..."
    cd $HOME/pollinations
    git fetch origin
    git stash || true
    git checkout $BRANCH
    git pull origin $BRANCH
else
    log "Cloning repo..."
    cd $HOME
    git clone https://github.com/pollinations/pollinations.git
    cd pollinations
    git checkout $BRANCH
fi

cd $HOME/pollinations/image.pollinations.ai/z-image

# Install python venv if needed
if ! dpkg -l | grep -q python3.12-venv 2>/dev/null; then
    log "Installing python3.12-venv..."
    sudo apt-get update -qq
    sudo apt-get install -y python3.12-venv python3.12-dev
fi

# Create venv if needed
if [ ! -d "venv" ]; then
    log "Creating venv..."
    python3.12 -m venv venv
fi

source venv/bin/activate

# Install dependencies
log "Installing PyTorch..."
pip install -q --upgrade pip
pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu124

log "Installing requirements..."
pip install -q -r requirements.txt
pip install -q spandrel gdown

# Download SPAN model
mkdir -p model_cache/span
if [ ! -f "model_cache/span/2x-NomosUni_span_multijpg.pth" ]; then
    log "Downloading SPAN model..."
    gdown '1PCYo-4R6MgM-cXAsTuMO-tH4tEcO8A8P' -O model_cache/span/2x-NomosUni_span_multijpg.pth
fi

WORKDIR=$(pwd)

# Create systemd services
log "Creating systemd services..."

sudo tee /etc/systemd/system/zimage-gpu0.service > /dev/null << EOF
[Unit]
Description=Z-Image GPU 0
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKDIR
Environment="CUDA_VISIBLE_DEVICES=0"
Environment="PORT=10000"
Environment="PUBLIC_IP=$PUBLIC_IP"
Environment="PUBLIC_PORT=$GPU0_PUBLIC_PORT"
Environment="SERVICE_TYPE=zimage"
Environment="PLN_ENTER_TOKEN=$PLN_ENTER_TOKEN"
ExecStart=$WORKDIR/venv/bin/python server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/zimage-gpu1.service > /dev/null << EOF
[Unit]
Description=Z-Image GPU 1
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKDIR
Environment="CUDA_VISIBLE_DEVICES=1"
Environment="PORT=10001"
Environment="PUBLIC_IP=$PUBLIC_IP"
Environment="PUBLIC_PORT=$GPU1_PUBLIC_PORT"
Environment="SERVICE_TYPE=zimage"
Environment="PLN_ENTER_TOKEN=$PLN_ENTER_TOKEN"
ExecStart=$WORKDIR/venv/bin/python server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload

# Stop any existing processes
log "Stopping existing processes..."
pkill -f 'python server.py' || true
sudo systemctl stop zimage-gpu0 zimage-gpu1 2>/dev/null || true
sleep 2

# Start services
log "Starting services..."
sudo systemctl start zimage-gpu0
sudo systemctl start zimage-gpu1
sudo systemctl enable zimage-gpu0 zimage-gpu1

sleep 5
log "Status:"
sudo systemctl status zimage-gpu0 --no-pager -l | head -10
sudo systemctl status zimage-gpu1 --no-pager -l | head -10

log "Setup complete! Endpoints:"
log "  GPU0: http://$PUBLIC_IP:$GPU0_PUBLIC_PORT"
log "  GPU1: http://$PUBLIC_IP:$GPU1_PUBLIC_PORT"
