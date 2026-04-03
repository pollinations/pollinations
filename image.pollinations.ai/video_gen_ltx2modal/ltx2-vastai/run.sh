#!/bin/bash
# Run LTX-2 ComfyUI wrapper server (manages ComfyUI lifecycle + watchdog)
# Usage: screen -dmS ltx2 bash run.sh
set -e

export CUDA_VISIBLE_DEVICES=0
export PORT=8765
export SERVICE_TYPE=ltx2
export REGISTER_URL="${REGISTER_URL:-http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register}"
export PLN_IMAGE_BACKEND_TOKEN="${PLN_IMAGE_BACKEND_TOKEN:?Set PLN_IMAGE_BACKEND_TOKEN env var}"
export COMFYUI_ROOT="${COMFYUI_ROOT:-/home/ubuntu/comfy/ComfyUI}"
export COMFYUI_LOG="${COMFYUI_LOG:-/home/ubuntu/comfy/comfyui.log}"
export WORKFLOW_PATH="${WORKFLOW_PATH:-/home/ubuntu/ltx2/workflow.json}"

# Kill any existing processes on our ports
fuser -k 8188/tcp 2>/dev/null || true
fuser -k 8765/tcp 2>/dev/null || true
sleep 2

# Start wrapper (it manages ComfyUI startup + watchdog auto-restart)
python3 "$(dirname "$0")/server_comfyui.py" 2>&1 | tee /home/ubuntu/ltx2/server_comfyui.log
