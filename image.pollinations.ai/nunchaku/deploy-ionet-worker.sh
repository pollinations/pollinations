#!/bin/bash
# End-to-end deployment script for IO.NET Flux Workers
# This script sets up a complete Flux worker on an IO.NET instance
#
# Prerequisites:
# - IO.NET instance with 2x RTX 4090 GPUs
# - Python 3.12 installed
# - Access to a working reference worker (for copying pre-compiled binaries)
#
# Usage:
#   HF_TOKEN=your_token \
#   WORKER_NUM=3 \
#   PUBLIC_IP=52.205.25.210 \
#   GPU0_PUBLIC_PORT=20555 \
#   GPU1_PUBLIC_PORT=29648 \
#   REFERENCE_HOST=io4090-6 \
#   bash deploy-ionet-worker.sh

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check required environment variables
if [ -z "$HF_TOKEN" ]; then
  echo -e "${RED}❌ Error: HF_TOKEN environment variable not set${NC}"
  echo "Usage: HF_TOKEN=your_token WORKER_NUM=3 PUBLIC_IP=52.205.25.210 GPU0_PUBLIC_PORT=20555 GPU1_PUBLIC_PORT=29648 bash deploy-ionet-worker.sh"
  exit 1
fi

if [ -z "$WORKER_NUM" ]; then
  echo -e "${RED}❌ Error: WORKER_NUM not set${NC}"
  exit 1
fi

if [ -z "$PUBLIC_IP" ]; then
  echo -e "${RED}❌ Error: PUBLIC_IP not set${NC}"
  exit 1
fi

if [ -z "$GPU0_PUBLIC_PORT" ]; then
  echo -e "${RED}❌ Error: GPU0_PUBLIC_PORT not set${NC}"
  exit 1
fi

if [ -z "$GPU1_PUBLIC_PORT" ]; then
  echo -e "${RED}❌ Error: GPU1_PUBLIC_PORT not set${NC}"
  exit 1
fi

# Optional: Reference host for copying pre-compiled binaries (default: io4090-6)
REFERENCE_HOST=${REFERENCE_HOST:-io4090-6}

echo -e "${GREEN}🚀 Deploying Flux to IO Worker ${WORKER_NUM}${NC}"
echo "Public IP: $PUBLIC_IP"
echo "GPU 0: Port 10000 → Public $GPU0_PUBLIC_PORT"
echo "GPU 1: Port 10001 → Public $GPU1_PUBLIC_PORT"
echo "Reference Host: $REFERENCE_HOST"
echo ""

# 1. Clone/Update repo
echo -e "${YELLOW}📦 Step 1: Setting up repository...${NC}"
if [ -d "$HOME/pollinations" ]; then
  echo "✅ Updating existing repo..."
  cd $HOME/pollinations
  git pull
else
  echo "📦 Cloning repo..."
  cd $HOME
  git clone --recursive https://github.com/pollinations/pollinations.git
  cd pollinations
fi

cd image.pollinations.ai/nunchaku

# 2. Check if we should copy from reference host or build locally
echo -e "${YELLOW}📦 Step 2: Setting up Python environment and nunchaku...${NC}"

if command -v ssh &> /dev/null && ssh -o ConnectTimeout=5 -o BatchMode=yes $REFERENCE_HOST "exit" 2>/dev/null; then
  echo "✅ Reference host $REFERENCE_HOST is accessible - will copy pre-built environment"
  
  # Copy venv from reference host
  if [ ! -d "venv" ]; then
    echo "📦 Copying Python venv from $REFERENCE_HOST..."
    ssh $REFERENCE_HOST "cd ~/pollinations/image.pollinations.ai/nunchaku && tar czf - venv" | tar xzf -
    
    # Fix python symlinks
    echo "🔧 Fixing Python symlinks..."
    cd venv/bin
    rm -f python python3 python3.12 2>/dev/null || true
    cp /usr/bin/python3.12 python3.12
    ln -s python3.12 python3
    ln -s python3 python
    cd ../..
  fi
  
  # Copy nunchaku package from reference host
  echo "📦 Copying nunchaku package from $REFERENCE_HOST..."
  ssh $REFERENCE_HOST "cd ~/nunchaku && tar czf - nunchaku" | tar xzf -
  
  # Copy safety_checker from reference host
  echo "📦 Copying safety_checker from $REFERENCE_HOST..."
  ssh $REFERENCE_HOST "cd ~/nunchaku && tar czf - safety_checker" | tar xzf -
  
  # Copy server.py from reference host
  echo "📦 Copying server.py from $REFERENCE_HOST..."
  ssh $REFERENCE_HOST "cat ~/nunchaku/server.py" > server.py
  
else
  echo -e "${YELLOW}⚠️  Reference host not accessible - building locally (this will take 10-15 minutes)${NC}"
  
  # Create venv if needed
  if [ ! -d "venv" ]; then
    echo "🔧 Creating venv..."
    python3.12 -m venv venv
  fi
  
  # Install dependencies
  echo "📦 Installing dependencies..."
  source venv/bin/activate
  pip install -r requirements.txt
  
  # Clone and build nunchaku
  if [ ! -d "$HOME/nunchaku" ]; then
    echo "📦 Cloning nunchaku..."
    cd $HOME
    git clone --recursive https://github.com/mit-han-lab/nunchaku.git
    cd nunchaku
    pip install -e .
  fi
  
  # Copy nunchaku package
  cd $HOME/pollinations/image.pollinations.ai/nunchaku
  cp -r $HOME/nunchaku/nunchaku ./
  cp -r $HOME/nunchaku/safety_checker ./
  cp $HOME/nunchaku/server.py ./
fi

# 3. Create .env file with HF_TOKEN
echo -e "${YELLOW}🔑 Step 3: Creating .env file...${NC}"
echo "HF_TOKEN=$HF_TOKEN" > $HOME/.env

# 4. Create systemd services
echo -e "${YELLOW}⚙️  Step 4: Creating systemd services...${NC}"

# GPU 0 Service
sudo tee /etc/systemd/system/ionet-flux-worker${WORKER_NUM}-gpu0.service > /dev/null <<SERVICE
[Unit]
Description=IO.NET Flux Server - Worker ${WORKER_NUM} GPU 0
After=network.target

[Service]
Type=simple
User=ionet
WorkingDirectory=/home/ionet/pollinations/image.pollinations.ai/nunchaku
Environment="PATH=/home/ionet/pollinations/image.pollinations.ai/nunchaku/venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="CUDA_VISIBLE_DEVICES=0"
Environment="PORT=10000"
Environment="PUBLIC_IP=${PUBLIC_IP}"
Environment="PUBLIC_PORT=${GPU0_PUBLIC_PORT}"
EnvironmentFile=-/home/ionet/.env
ExecStart=/home/ionet/pollinations/image.pollinations.ai/nunchaku/venv/bin/python server.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

# GPU 1 Service
sudo tee /etc/systemd/system/ionet-flux-worker${WORKER_NUM}-gpu1.service > /dev/null <<SERVICE
[Unit]
Description=IO.NET Flux Server - Worker ${WORKER_NUM} GPU 1
After=network.target

[Service]
Type=simple
User=ionet
WorkingDirectory=/home/ionet/pollinations/image.pollinations.ai/nunchaku
Environment="PATH=/home/ionet/pollinations/image.pollinations.ai/nunchaku/venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="CUDA_VISIBLE_DEVICES=1"
Environment="PORT=10001"
Environment="PUBLIC_IP=${PUBLIC_IP}"
Environment="PUBLIC_PORT=${GPU1_PUBLIC_PORT}"
EnvironmentFile=-/home/ionet/.env
ExecStart=/home/ionet/pollinations/image.pollinations.ai/nunchaku/venv/bin/python server.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

# 5. Enable and start services
echo -e "${YELLOW}🚀 Step 5: Starting services...${NC}"
sudo systemctl daemon-reload
sudo systemctl enable ionet-flux-worker${WORKER_NUM}-gpu0 ionet-flux-worker${WORKER_NUM}-gpu1
sudo systemctl start ionet-flux-worker${WORKER_NUM}-gpu0 ionet-flux-worker${WORKER_NUM}-gpu1

# 6. Wait for services to start
echo ""
echo -e "${YELLOW}⏳ Waiting for services to load models (this takes 2-3 minutes)...${NC}"
sleep 10

# 7. Check status
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "📊 Service Status:"
sudo systemctl status ionet-flux-worker${WORKER_NUM}-gpu0 --no-pager -l | head -20
echo ""
sudo systemctl status ionet-flux-worker${WORKER_NUM}-gpu1 --no-pager -l | head -20

echo ""
echo -e "${GREEN}🧪 Test commands (wait 2-3 minutes for models to load):${NC}"
echo "curl -X POST http://${PUBLIC_IP}:${GPU0_PUBLIC_PORT}/generate -H 'Content-Type: application/json' -d '{\"prompt\": \"a cute cat\", \"num_inference_steps\": 4}' --output test-gpu0.png"
echo "curl -X POST http://${PUBLIC_IP}:${GPU1_PUBLIC_PORT}/generate -H 'Content-Type: application/json' -d '{\"prompt\": \"a cute dog\", \"num_inference_steps\": 4}' --output test-gpu1.png"

echo ""
echo -e "${GREEN}📋 Monitor logs:${NC}"
echo "sudo journalctl -u ionet-flux-worker${WORKER_NUM}-gpu0 -u ionet-flux-worker${WORKER_NUM}-gpu1 -f"

echo ""
echo -e "${GREEN}🎯 Expected heartbeat URLs:${NC}"
echo "GPU 0: http://${PUBLIC_IP}:${GPU0_PUBLIC_PORT}"
echo "GPU 1: http://${PUBLIC_IP}:${GPU1_PUBLIC_PORT}"
