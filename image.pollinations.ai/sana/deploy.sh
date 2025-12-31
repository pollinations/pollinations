#!/bin/bash
set -e

# SANA Sprint Server Deployment Script
# Usage: ./deploy.sh <ssh-host> [num-gpus]
# Example: ./deploy.sh sana-1 2

HOST=${1:?Usage: ./deploy.sh <ssh-host> [num-gpus]}
NUM_GPUS=${2:-1}

echo "Deploying SANA to $HOST with $NUM_GPUS GPU(s)..."

# Sync repo
echo "Syncing repository..."
ssh $HOST "git clone -b feat/sana-sprint-server https://github.com/pollinations/pollinations.git /root/pollinations 2>/dev/null || (cd /root/pollinations && git fetch origin && git checkout feat/sana-sprint-server && git pull)"

# Setup venv if needed
echo "Setting up Python environment..."
ssh $HOST "cd /root/pollinations/image.pollinations.ai/sana && (test -d venv || python3 -m venv venv) && ./venv/bin/pip install -q --upgrade pip && ./venv/bin/pip install -q -r requirements.txt"

# Run systemd setup script on remote
echo "Setting up systemd services..."
ssh $HOST "cd /root/pollinations/image.pollinations.ai/sana && chmod +x setup-systemd.sh && ./setup-systemd.sh $NUM_GPUS"

echo ""
echo "Deployment complete!"
