#!/bin/bash
# Z-Image setup script for IO.net workers
# Run ON the instance after SSHing in
# Usage: GPU0_PUBLIC_PORT=24602 GPU1_PUBLIC_PORT=25962 bash setup-ionet.sh

set -e

# Required parameters
if [ -z "$GPU0_PUBLIC_PORT" ] || [ -z "$GPU1_PUBLIC_PORT" ]; then
    echo "ERROR: GPU0_PUBLIC_PORT and GPU1_PUBLIC_PORT must be set"
    echo "Usage: GPU0_PUBLIC_PORT=24602 GPU1_PUBLIC_PORT=25962 bash setup-ionet.sh"
    exit 1
fi

PUBLIC_IP="${PUBLIC_IP:-52.205.25.210}"
PLN_ENTER_TOKEN="${PLN_ENTER_TOKEN:-cZOpvvV4xpbOe1IOYrN0R2a3zxHEAcLntneihfU3f2Y3Pfy5}"
BRANCH="${BRANCH:-main}"
SPAN_MODEL_ID="1PCYo-4R6MgM-cXAsTuMO-tH4tEcO8A8P"

log() { echo "[$(date '+%H:%M:%S')] $1"; }

log "=== Z-Image IO.net Setup ==="
log "GPU0: $GPU0_PUBLIC_PORT | GPU1: $GPU1_PUBLIC_PORT | IP: $PUBLIC_IP"

# 1. System dependencies
log "Installing system dependencies..."
if ! dpkg -l | grep -q python3.12-venv 2>/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y python3.12-venv python3.12-dev
fi

# 2. Clone or update repo
log "Setting up repository..."
cd $HOME
if [ -d "pollinations" ]; then
    cd pollinations
    git fetch origin
    git stash 2>/dev/null || true
    git checkout $BRANCH
    git reset --hard origin/$BRANCH
else
    git clone https://github.com/pollinations/pollinations.git
    cd pollinations
    git checkout $BRANCH
fi

WORKDIR="$HOME/pollinations/image.pollinations.ai/z-image"
cd $WORKDIR

# 3. Python environment
log "Setting up Python environment..."
if [ ! -d "venv" ]; then
    python3.12 -m venv venv
fi
source venv/bin/activate
pip install -q --upgrade pip

# 4. Install dependencies (PyTorch first, then rest)
log "Installing PyTorch with CUDA..."
pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu124

log "Installing other dependencies..."
pip install -q -r requirements.txt

# 5. Download SPAN upscaler model
mkdir -p model_cache/span
SPAN_MODEL="model_cache/span/2x-NomosUni_span_multijpg.pth"
if [ ! -f "$SPAN_MODEL" ] || [ $(stat -c%s "$SPAN_MODEL" 2>/dev/null || echo 0) -lt 1000000 ]; then
    log "Downloading SPAN 2x upscaler model..."
    pip install -q gdown
    gdown "$SPAN_MODEL_ID" -O "$SPAN_MODEL"
fi

# 6. Create systemd services
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

# 7. Start services
log "Starting services..."
sudo systemctl daemon-reload
pkill -f 'python server.py' 2>/dev/null || true
sudo systemctl stop zimage-gpu0 zimage-gpu1 2>/dev/null || true
sleep 2
sudo systemctl enable zimage-gpu0 zimage-gpu1
sudo systemctl start zimage-gpu0 zimage-gpu1

# 8. Wait for startup and verify
log "Waiting for services to start..."
sleep 10
for i in {1..30}; do
    if curl -s -m 2 http://localhost:10000/health > /dev/null 2>&1; then
        log "GPU0 is healthy!"
        break
    fi
    sleep 2
done

for i in {1..30}; do
    if curl -s -m 2 http://localhost:10001/health > /dev/null 2>&1; then
        log "GPU1 is healthy!"
        break
    fi
    sleep 2
done

log "=== Setup Complete ==="
log "Endpoints:"
log "  GPU0: http://$PUBLIC_IP:$GPU0_PUBLIC_PORT"
log "  GPU1: http://$PUBLIC_IP:$GPU1_PUBLIC_PORT"
log ""
log "Check status: sudo systemctl status zimage-gpu0 zimage-gpu1"
log "View logs: sudo journalctl -u zimage-gpu0 -f"
