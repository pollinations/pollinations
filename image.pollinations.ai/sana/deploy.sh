#!/bin/bash
set -e

# SANA Sprint Server Deployment Script
# Usage: ./deploy.sh <ssh-host> [num-gpus]
# Example: ./deploy.sh sana-1 2

HOST=${1:?Usage: ./deploy.sh <ssh-host> [num-gpus]}
NUM_GPUS=${2:-1}

echo "Deploying SANA to $HOST with $NUM_GPUS GPU(s)..."

# Get public IP
PUBLIC_IP=$(ssh $HOST "curl -s https://api.ipify.org")
echo "Public IP: $PUBLIC_IP"

# Sync repo
echo "Syncing repository..."
ssh $HOST "git clone -b feat/sana-sprint-server https://github.com/pollinations/pollinations.git /root/pollinations 2>/dev/null || (cd /root/pollinations && git fetch origin && git checkout feat/sana-sprint-server && git pull)"

# Setup venv if needed
echo "Setting up Python environment..."
ssh $HOST "cd /root/pollinations/image.pollinations.ai/sana && (test -d venv || python3 -m venv venv) && ./venv/bin/pip install -q --upgrade pip && ./venv/bin/pip install -q -r requirements.txt"

# Copy latest server.py
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scp "$SCRIPT_DIR/server.py" $HOST:/root/pollinations/image.pollinations.ai/sana/server.py

# Create systemd services
echo "Creating systemd services..."
for i in $(seq 0 $((NUM_GPUS - 1))); do
    PORT=$((10002 + i))
    SERVICE_NAME="sana-gpu$i"
    
    ssh $HOST "cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=SANA GPU $i
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/pollinations/image.pollinations.ai/sana
Environment=\"CUDA_VISIBLE_DEVICES=$i\"
Environment=\"PORT=$PORT\"
Environment=\"PUBLIC_IP=$PUBLIC_IP\"
Environment=\"SERVICE_TYPE=sana\"
ExecStart=/root/pollinations/image.pollinations.ai/sana/venv/bin/python server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF"
    echo "Created $SERVICE_NAME.service (port $PORT)"
done

# Reload and start services
echo "Starting services..."
ssh $HOST "systemctl daemon-reload"

SERVICES=""
for i in $(seq 0 $((NUM_GPUS - 1))); do
    SERVICES="$SERVICES sana-gpu$i"
done

ssh $HOST "systemctl enable $SERVICES && systemctl restart $SERVICES"

# Wait and check status
sleep 10
echo ""
echo "Service status:"
ssh $HOST "systemctl status $SERVICES --no-pager | grep -E '(Active:|Heartbeat)'" || true

echo ""
echo "Deployment complete! Services running on ports 10002-$((10001 + NUM_GPUS))"
