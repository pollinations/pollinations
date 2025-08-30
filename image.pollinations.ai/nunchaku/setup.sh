#!/bin/bash

# FLUX Schnell Nunchaku Setup Script
# This script sets up the complete environment for running FLUX Schnell with nunchaku optimizations

set -e  # Exit on any error

echo "🚀 Starting FLUX Schnell Nunchaku Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if we're in the right directory
if [[ ! -f "server.py" ]]; then
    print_error "Please run this script from the nunchaku directory"
    exit 1
fi

print_status "Setting up Python virtual environment..."

# Create virtual environment if it doesn't exist
if [[ ! -d "nunchaku_env" ]]; then
    python3 -m venv nunchaku_env
    print_status "Created virtual environment"
else
    print_warning "Virtual environment already exists"
fi

# Activate virtual environment
source nunchaku_env/bin/activate
print_status "Activated virtual environment"

# Upgrade pip
print_status "Upgrading pip..."
pip install --upgrade pip

# Install PyTorch with CUDA support
print_status "Installing PyTorch with CUDA 11.8 support..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Install core ML dependencies
print_status "Installing core ML dependencies..."
pip install diffusers transformers accelerate safetensors

# Install web framework dependencies
print_status "Installing web framework dependencies..."
pip install fastapi uvicorn flask flask-cors

# Install additional dependencies
print_status "Installing additional dependencies..."
pip install pillow numpy requests

# Create nunchaku package structure if it doesn't exist
if [[ ! -f "nunchaku/__init__.py" ]]; then
    mkdir -p nunchaku
    touch nunchaku/__init__.py
    print_status "Created nunchaku package structure"
fi

# Install safety checker dependencies
print_status "Installing safety checker dependencies..."
pip install transformers torch pillow
print_status "Safety checker dependencies installed"

# Set up firewall rules (if running with sudo privileges)
if command -v ufw >/dev/null 2>&1; then
    print_status "Configuring firewall rules..."
    if sudo -n true 2>/dev/null; then
        sudo ufw allow 8765/tcp
        print_status "Firewall configured for port 8765"
    else
        print_warning "No sudo privileges - please manually run: sudo ufw allow 8765/tcp"
    fi
else
    print_warning "UFW not available - firewall configuration skipped"
fi

# Create a simple start script
cat > start_server.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
source nunchaku_env/bin/activate
echo "🚀 Starting FLUX Schnell server on port 8765..."
python server.py
EOF

chmod +x start_server.sh
print_status "Created start_server.sh script"

# Create a service management script
cat > manage_service.sh << 'EOF'
#!/bin/bash

SERVICE_NAME="flux-schnell"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SCRIPT="$SCRIPT_DIR/start_server.sh"

case "$1" in
    start)
        echo "Starting FLUX Schnell service..."
        cd "$SCRIPT_DIR"
        nohup ./start_server.sh > flux_server.log 2>&1 &
        echo $! > flux_server.pid
        echo "Service started. PID: $(cat flux_server.pid)"
        echo "Logs: tail -f flux_server.log"
        ;;
    stop)
        if [[ -f flux_server.pid ]]; then
            PID=$(cat flux_server.pid)
            if kill -0 $PID 2>/dev/null; then
                kill $PID
                rm flux_server.pid
                echo "Service stopped"
            else
                echo "Service not running"
                rm -f flux_server.pid
            fi
        else
            echo "PID file not found. Service may not be running."
        fi
        ;;
    status)
        if [[ -f flux_server.pid ]]; then
            PID=$(cat flux_server.pid)
            if kill -0 $PID 2>/dev/null; then
                echo "Service is running (PID: $PID)"
            else
                echo "Service is not running (stale PID file)"
                rm -f flux_server.pid
            fi
        else
            echo "Service is not running"
        fi
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    logs)
        if [[ -f flux_server.log ]]; then
            tail -f flux_server.log
        else
            echo "No log file found"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart|logs}"
        exit 1
        ;;
esac
EOF

chmod +x manage_service.sh
print_status "Created manage_service.sh script"

# Test the installation
print_status "Testing installation..."
python -c "import torch; print(f'PyTorch version: {torch.__version__}'); print(f'CUDA available: {torch.cuda.is_available()}')"
python -c "import diffusers; print(f'Diffusers version: {diffusers.__version__}')"
python -c "import fastapi; print(f'FastAPI version: {fastapi.__version__}')"

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Start the server: ./manage_service.sh start"
echo "2. Check status: ./manage_service.sh status"
echo "3. View logs: ./manage_service.sh logs"
echo "4. Stop server: ./manage_service.sh stop"
echo ""
echo "🌐 Server will be available at: http://$(curl -s ifconfig.me):8765"
echo ""
echo "🧪 Test the API:"
echo "curl -X POST http://$(curl -s ifconfig.me):8765/generate \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"prompts\": [\"a beautiful sunset\"], \"width\": 512, \"height\": 512, \"steps\": 4}'"
