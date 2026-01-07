#!/bin/bash
set -e

# Setup systemd services for SANA Sprint on the local machine
# Usage: ./setup-systemd.sh [num-gpus]
# Run this script ON the target server

NUM_GPUS=${1:-1}
PUBLIC_IP=$(curl -s https://api.ipify.org)
WORKDIR=$(dirname "$(readlink -f "$0")")

echo "Setting up SANA systemd services..."
echo "GPUs: $NUM_GPUS, IP: $PUBLIC_IP, Dir: $WORKDIR"

for i in $(seq 0 $((NUM_GPUS - 1))); do
    PORT=$((10002 + i))
    SERVICE="sana-gpu$i"
    
    cat > /etc/systemd/system/$SERVICE.service << EOF
[Unit]
Description=SANA GPU $i
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$WORKDIR
Environment="CUDA_VISIBLE_DEVICES=$i"
Environment="PORT=$PORT"
Environment="PUBLIC_IP=$PUBLIC_IP"
Environment="SERVICE_TYPE=sana"
ExecStart=$WORKDIR/venv/bin/python server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    echo "Created $SERVICE.service (port $PORT)"
done

systemctl daemon-reload

SERVICES=$(seq -s' ' 0 $((NUM_GPUS - 1)) | xargs -I{} echo sana-gpu{})
systemctl enable $SERVICES
systemctl restart $SERVICES

echo "Services started. Checking status..."
sleep 5
systemctl status $SERVICES --no-pager | grep -E '(Active:|sana-gpu)' || true
