#!/bin/bash
cd "$(dirname "$0")"
source nunchaku_env/bin/activate
echo "🚀 Starting FLUX Schnell server on port 8765..."
python server.py
