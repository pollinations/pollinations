#!/bin/bash
# Flux Schnell Server Setup Script
# 
# This script sets up a complete Flux inference server on an IO.NET worker.
# Run this on a fresh Ubuntu 24.04 instance with RTX 4090 GPUs.
#
# Usage:
#   HF_TOKEN=your_token \
#   WORKER_NUM=1 \
#   PUBLIC_IP=52.205.25.210 \
#   GPU0_PUBLIC_PORT=27235 \
#   GPU1_PUBLIC_PORT=30830 \
#   bash setup.sh
#
# What this script does:
# 1. Installs system dependencies (CUDA 12.8, Python 3.12 dev headers)
# 2. Clones/updates the pollinations repo
# 3. Creates venv and installs Python dependencies
# 4. Clones and builds nunchaku from source
# 5. Creates systemd services for each GPU
# 6. Starts the services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BLUE}$1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# Validate required environment variables
validate_env() {
    local missing=0
    for var in HF_TOKEN WORKER_NUM PUBLIC_IP GPU0_PUBLIC_PORT GPU1_PUBLIC_PORT; do
        if [ -z "${!var}" ]; then
            log_error "Missing required environment variable: $var"
            missing=1
        fi
    done
    if [ $missing -eq 1 ]; then
        echo ""
        echo "Usage:"
        echo "  HF_TOKEN=your_token \\"
        echo "  WORKER_NUM=1 \\"
        echo "  PUBLIC_IP=52.205.25.210 \\"
        echo "  GPU0_PUBLIC_PORT=27235 \\"
        echo "  GPU1_PUBLIC_PORT=30830 \\"
        echo "  bash setup.sh"
        exit 1
    fi
}

# Install system dependencies
install_system_deps() {
    log_step "📦 Step 1: Installing system dependencies"
    
    # Check if CUDA 12.8 is installed
    if [ -d "/usr/local/cuda-12.8" ]; then
        log_info "CUDA 12.8 already installed"
    else
        log_info "Installing CUDA 12.8..."
        wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
        sudo dpkg -i cuda-keyring_1.1-1_all.deb
        sudo apt-get update
        sudo apt-get install -y cuda-toolkit-12-8
        rm cuda-keyring_1.1-1_all.deb
    fi
    
    # Install Python dev headers (required for building nunchaku)
    log_info "Installing Python 3.12 development headers..."
    sudo apt-get update
    sudo apt-get install -y python3.12-venv python3.12-dev
    
    # Set CUDA environment
    export PATH=/usr/local/cuda-12.8/bin:$PATH
    export CUDA_HOME=/usr/local/cuda-12.8
    export LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH
    
    log_info "System dependencies installed"
}

# Setup repository
setup_repo() {
    log_step "📦 Step 2: Setting up repository"
    
    if [ -d "$HOME/pollinations" ]; then
        log_info "Updating existing repo..."
        cd $HOME/pollinations
        git pull
    else
        log_info "Cloning repo..."
        cd $HOME
        git clone https://github.com/pollinations/pollinations.git
    fi
    
    cd $HOME/pollinations/image.pollinations.ai/nunchaku
    log_info "Repository ready"
}

# Setup Python environment
setup_python_env() {
    log_step "📦 Step 3: Setting up Python environment"
    
    # Remove old venv if exists
    if [ -d "venv" ]; then
        log_warn "Removing old venv..."
        rm -rf venv
    fi
    
    log_info "Creating fresh venv..."
    python3.12 -m venv venv
    source venv/bin/activate
    
    log_info "Upgrading pip..."
    pip install --upgrade pip
    
    log_info "Installing PyTorch with CUDA 12.8..."
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
    
    log_info "Installing other requirements..."
    pip install -r requirements.txt
    
    log_info "Python environment ready"
}

# Build and install nunchaku
build_nunchaku() {
    log_step "📦 Step 4: Building nunchaku (this takes 10-15 minutes)"
    
    # Set CUDA environment for build
    export PATH=/usr/local/cuda-12.8/bin:$PATH
    export CUDA_HOME=/usr/local/cuda-12.8
    export LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH
    
    # Clone nunchaku if not exists
    if [ ! -d "$HOME/nunchaku" ]; then
        log_info "Cloning nunchaku..."
        cd $HOME
        git clone --recursive https://github.com/mit-han-lab/nunchaku.git
    else
        log_info "Updating nunchaku..."
        cd $HOME/nunchaku
        git pull
        git submodule update --init --recursive
    fi
    
    cd $HOME/nunchaku
    source $HOME/pollinations/image.pollinations.ai/nunchaku/venv/bin/activate
    
    # Clean previous build
    rm -rf build/ dist/ *.egg-info
    
    log_info "Building nunchaku for RTX 4090 (SM 8.9)..."
    TORCH_CUDA_ARCH_LIST="8.9" pip install -e .
    
    # Verify installation
    python -c "from nunchaku.models import NunchakuFluxTransformer2dModel; print('✅ nunchaku installed successfully')"
    
    log_info "Nunchaku build complete"
}

# Create .env file
create_env_file() {
    log_step "🔑 Step 5: Creating .env file"
    echo "HF_TOKEN=$HF_TOKEN" > $HOME/.env
    log_info "Environment file created at $HOME/.env"
}

# Create systemd services
create_services() {
    log_step "⚙️  Step 6: Creating systemd services"
    
    local user=$(whoami)
    local work_dir="$HOME/pollinations/image.pollinations.ai/nunchaku"
    local venv_path="$work_dir/venv/bin"
    
    # GPU 0 Service
    sudo tee /etc/systemd/system/ionet-flux-worker${WORKER_NUM}-gpu0.service > /dev/null <<SERVICE
[Unit]
Description=IO.NET Flux Server - Worker ${WORKER_NUM} GPU 0
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${work_dir}
Environment="PATH=${venv_path}:/usr/local/cuda-12.8/bin:/usr/local/bin:/usr/bin:/bin"
Environment="CUDA_HOME=/usr/local/cuda-12.8"
Environment="LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64"
Environment="CUDA_VISIBLE_DEVICES=0"
Environment="PORT=10000"
Environment="PUBLIC_IP=${PUBLIC_IP}"
Environment="PUBLIC_PORT=${GPU0_PUBLIC_PORT}"
EnvironmentFile=-${HOME}/.env
ExecStart=${venv_path}/python server.py
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
User=${user}
WorkingDirectory=${work_dir}
Environment="PATH=${venv_path}:/usr/local/cuda-12.8/bin:/usr/local/bin:/usr/bin:/bin"
Environment="CUDA_HOME=/usr/local/cuda-12.8"
Environment="LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64"
Environment="CUDA_VISIBLE_DEVICES=1"
Environment="PORT=10001"
Environment="PUBLIC_IP=${PUBLIC_IP}"
Environment="PUBLIC_PORT=${GPU1_PUBLIC_PORT}"
EnvironmentFile=-${HOME}/.env
ExecStart=${venv_path}/python server.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

    log_info "Systemd services created"
}

# Start services
start_services() {
    log_step "🚀 Step 7: Starting services"
    
    sudo systemctl daemon-reload
    sudo systemctl enable ionet-flux-worker${WORKER_NUM}-gpu0 ionet-flux-worker${WORKER_NUM}-gpu1
    sudo systemctl start ionet-flux-worker${WORKER_NUM}-gpu0 ionet-flux-worker${WORKER_NUM}-gpu1
    
    log_info "Services started"
}

# Print summary
print_summary() {
    log_step "✅ Deployment Complete!"
    
    echo ""
    echo -e "${GREEN}Worker ${WORKER_NUM} is now running on:${NC}"
    echo "  GPU 0: http://${PUBLIC_IP}:${GPU0_PUBLIC_PORT}"
    echo "  GPU 1: http://${PUBLIC_IP}:${GPU1_PUBLIC_PORT}"
    echo ""
    echo -e "${YELLOW}Monitor logs:${NC}"
    echo "  sudo journalctl -u ionet-flux-worker${WORKER_NUM}-gpu0 -u ionet-flux-worker${WORKER_NUM}-gpu1 -f"
    echo ""
    echo -e "${YELLOW}Check status:${NC}"
    echo "  sudo systemctl status ionet-flux-worker${WORKER_NUM}-gpu0 ionet-flux-worker${WORKER_NUM}-gpu1"
    echo ""
    echo -e "${YELLOW}Test endpoint (wait 2-3 min for models to load):${NC}"
    echo "  curl -X POST http://${PUBLIC_IP}:${GPU0_PUBLIC_PORT}/generate \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"prompt\": \"a cute cat\", \"num_inference_steps\": 4}' \\"
    echo "    --output test.png"
}

# Main
main() {
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║           Flux Schnell Server Setup Script                ║"
    echo "║                   pollinations.ai                         ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    validate_env
    
    echo ""
    log_info "Deploying Worker ${WORKER_NUM}"
    log_info "Public IP: ${PUBLIC_IP}"
    log_info "GPU 0 Port: ${GPU0_PUBLIC_PORT}"
    log_info "GPU 1 Port: ${GPU1_PUBLIC_PORT}"
    
    install_system_deps
    setup_repo
    setup_python_env
    build_nunchaku
    create_env_file
    create_services
    start_services
    print_summary
}

main "$@"
