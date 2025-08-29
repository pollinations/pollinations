#!/bin/bash

# FLUX Schnell Complete Setup Script
# This script sets up the complete environment for FLUX Schnell deployment
# Usage: ./setup_complete.sh [HF_TOKEN]

set -e  # Exit on any error

# Check if HF token is provided
if [ -z "$1" ]; then
    echo "Error: HuggingFace token required"
    echo "Usage: $0 <HF_TOKEN>"
    echo "Example: $0 hf_your_token_here"
    exit 1
fi

HF_TOKEN="$1"

echo "=== FLUX Schnell Complete Setup ==="
echo "Starting complete setup process..."

# Update system packages
echo "Updating system packages..."
sudo apt update
sudo apt install -y python3-pip python3-venv git curl wget

# Create virtual environment
echo "Creating Python virtual environment..."
python3 -m venv nunchaku_env
source nunchaku_env/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install PyTorch with CUDA support (CRITICAL: Use 2.5.1+cu121 for nunchaku compatibility)
echo "Installing PyTorch 2.5.1 with CUDA 12.1..."
pip install torch==2.5.1+cu121 torchvision==0.20.1+cu121 torchaudio==2.5.1+cu121 --index-url https://download.pytorch.org/whl/cu121

# Install core dependencies
echo "Installing core dependencies..."
pip install diffusers transformers accelerate
pip install fastapi uvicorn
pip install python-multipart aiohttp
pip install requests pillow
pip install protobuf sentencepiece
pip install huggingface_hub

# Install nunchaku for optimized FLUX inference
echo "Installing nunchaku optimization package..."
pip install https://github.com/nunchaku-tech/nunchaku/releases/download/v0.3.2/nunchaku-0.3.2+torch2.5-cp310-cp310-linux_x86_64.whl

# Set up HuggingFace authentication
echo "Setting up HuggingFace authentication..."
export HUGGINGFACE_HUB_TOKEN="$HF_TOKEN"
echo "export HUGGINGFACE_HUB_TOKEN=\"$HF_TOKEN\"" >> ~/.bashrc

# Login to HuggingFace
echo "Logging into HuggingFace..."
huggingface-cli login --token "$HF_TOKEN"

# Create start server script
echo "Creating start server script..."
cat > start_server.sh << SCRIPT_EOF
#!/bin/bash
cd /home/ubuntu/pollinations/image.pollinations.ai/nunchaku
source nunchaku_env/bin/activate
export HUGGINGFACE_HUB_TOKEN="$HF_TOKEN"
export PORT=8765
export SERVICE_TYPE=flux
python server.py
SCRIPT_EOF

chmod +x start_server.sh

# Create service management script
echo "Creating service management script..."
cat > manage_service.sh << 'SCRIPT_EOF'
#!/bin/bash

SERVICE_NAME="flux-schnell"
SCRIPT_DIR="/home/ubuntu/pollinations/image.pollinations.ai/nunchaku"

case $1 in
    start)
        echo "Starting FLUX Schnell service..."
        cd $SCRIPT_DIR
        nohup ./start_server.sh > flux_server.log 2>&1 &
        echo $! > flux_server.pid
        echo "Service started. PID: $(cat flux_server.pid)"
        echo "Log file: flux_server.log"
        ;;
    stop)
        if [ -f flux_server.pid ]; then
            PID=$(cat flux_server.pid)
            echo "Stopping FLUX Schnell service (PID: $PID)..."
            kill $PID 2>/dev/null || echo "Process already stopped"
            rm -f flux_server.pid
            echo "Service stopped"
        else
            echo "No PID file found. Service may not be running."
        fi
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    status)
        if [ -f flux_server.pid ]; then
            PID=$(cat flux_server.pid)
            if ps -p $PID > /dev/null 2>&1; then
                echo "Service is running (PID: $PID)"
                echo "Server should be accessible at: http://$(curl -s https://api.ipify.org):8765"
            else
                echo "PID file exists but process is not running"
                rm -f flux_server.pid
            fi
        else
            echo "Service is not running"
        fi
        ;;
    logs)
        if [ -f flux_server.log ]; then
            tail -f flux_server.log
        else
            echo "No log file found"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
SCRIPT_EOF

chmod +x manage_service.sh

# Create environment file for systemd service
echo "Creating environment file for systemd service..."
echo "HUGGINGFACE_HUB_TOKEN=\"$HF_TOKEN\"" > ~/.env
echo "PORT=8765" >> ~/.env
echo "SERVICE_TYPE=flux" >> ~/.env

# Install systemd service
echo "Installing systemd service..."
sudo cp flux-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable flux-server
echo "Systemd service installed and enabled"

# Test CUDA availability
echo "Testing CUDA availability..."
python3 -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA devices: {torch.cuda.device_count()}')"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To start the FLUX Schnell server:"
echo "  sudo systemctl start flux-server"
echo "  OR: ./manage_service.sh start"
echo ""
echo "To check status:"
echo "  sudo systemctl status flux-server"
echo "  OR: ./manage_service.sh status"
echo ""
echo "To view logs:"
echo "  sudo journalctl -u flux-server -f"
echo "  OR: ./manage_service.sh logs"
echo ""
echo "To stop the server:"
echo "  sudo systemctl stop flux-server"
echo "  OR: ./manage_service.sh stop"
echo ""
echo "Server will be available at: http://$(curl -s https://api.ipify.org):8765/generate"
echo ""
