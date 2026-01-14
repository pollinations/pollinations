#!/bin/bash

# Quick start script for FLUX.2-dev-Turbo
# Minimal setup for immediate testing

set -e

echo "=== FLUX.2-dev-Turbo Quick Start ==="

# Check Python
if ! command -v python3.12 &> /dev/null; then
    echo "❌ Python 3.12 not found"
    exit 1
fi

# Create venv if missing
if [ ! -d venv ]; then
    echo "Creating Python virtual environment..."
    python3.12 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip setuptools wheel
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt

echo "✅ Environment ready"
echo ""
echo "To start the server:"
echo "  source venv/bin/activate"
echo "  python server.py"
echo ""
echo "In another terminal, test with:"
echo "  curl http://localhost:10003/health"
