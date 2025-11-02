#!/bin/bash
# Final deployment - stream tar directly to workers
set -e

# Set HF_TOKEN environment variable before running this script
# export HF_TOKEN="your_huggingface_token_here"
if [ -z "$HF_TOKEN" ]; then
    echo "Error: HF_TOKEN environment variable not set"
    exit 1
fi

deploy_worker() {
    local worker=$1
    local gpu0_port=$2
    local gpu1_port=$3
    
    echo ""
    echo "🚀 Deploying $worker..."
    echo "  Streaming package from io4090-6..."
    
    # Stream tar directly from io4090-6 to target worker
    ssh io4090-6 "cd ~/nunchaku && tar czf - ." | ssh $worker "cd ~ && rm -rf nunchaku && mkdir -p nunchaku && cd nunchaku && tar xzf -"
    
    echo "  Configuring environment..."
    ssh $worker "bash -s" <<SETUP
cd ~/nunchaku

# Fix Python symlinks
cd venv/bin
rm -f python python3 python3.12 2>/dev/null || true
cp /usr/bin/python3.12 python3.12
ln -s python3.12 python3
ln -s python3 python
cd ../..

# Create .env
echo "HF_TOKEN=${HF_TOKEN}" > ~/.env

echo "✅ Environment configured"
SETUP

    echo "  Creating systemd services..."
    ssh $worker "bash -s" <<SERVICES
# GPU 0 service
sudo tee /etc/systemd/system/ionet-flux-gpu0.service > /dev/null <<'SERVICE'
[Unit]
Description=IO.NET Flux Server - GPU 0
After=network.target

[Service]
Type=simple
User=ionet
WorkingDirectory=/home/ionet/nunchaku
Environment="PATH=/home/ionet/nunchaku/venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="CUDA_VISIBLE_DEVICES=0"
Environment="PORT=10000"
Environment="PUBLIC_IP=52.205.25.210"
Environment="PUBLIC_PORT=${gpu0_port}"
Environment="HF_TOKEN=${HF_TOKEN}"
ExecStart=/home/ionet/nunchaku/venv/bin/python server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

# GPU 1 service
sudo tee /etc/systemd/system/ionet-flux-gpu1.service > /dev/null <<'SERVICE'
[Unit]
Description=IO.NET Flux Server - GPU 1
After=network.target

[Service]
Type=simple
User=ionet
WorkingDirectory=/home/ionet/nunchaku
Environment="PATH=/home/ionet/nunchaku/venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="CUDA_VISIBLE_DEVICES=1"
Environment="PORT=10001"
Environment="PUBLIC_IP=52.205.25.210"
Environment="PUBLIC_PORT=${gpu1_port}"
Environment="HF_TOKEN=${HF_TOKEN}"
ExecStart=/home/ionet/nunchaku/venv/bin/python server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

# Reload and start
sudo systemctl daemon-reload
sudo systemctl enable ionet-flux-gpu0 ionet-flux-gpu1
sudo systemctl restart ionet-flux-gpu0 ionet-flux-gpu1

echo "✅ Services started"
SERVICES

    echo "✅ $worker deployed!"
    echo "  GPU 0: http://52.205.25.210:${gpu0_port}"
    echo "  GPU 1: http://52.205.25.210:${gpu1_port}"
}

# Deploy both workers
deploy_worker "io4090-9" "21331" "31029"
deploy_worker "io4090-10" "28028" "21922"

echo ""
echo "✅ All workers deployed!"
echo ""
echo "📊 Summary:"
echo "Worker 9 (io4090-9):"
echo "  GPU 0: http://52.205.25.210:21331"
echo "  GPU 1: http://52.205.25.210:31029"
echo ""
echo "Worker 10 (io4090-10):"
echo "  GPU 0: http://52.205.25.210:28028"
echo "  GPU 1: http://52.205.25.210:21922"
echo ""
echo "⏳ Models loading... wait 2-3 minutes then check status:"
echo "./image.pollinations.ai/nunchaku/check-flux-workers.sh"
